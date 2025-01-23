import { useStore } from '@/stores/rootStore';
import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onTranscriptionComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { projects, activeProjectId } = useStore();
  const activeProject = projects.find(p => p.id === activeProjectId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleButtonClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio context and analyser for visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      // Don't connect to destination to avoid feedback
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;
      audioContextRef.current = audioContext;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setIsProcessing(true);
        await sendToGroqWhisper(audioBlob);
        setIsProcessing(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Error accessing microphone. Please ensure microphone permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  const updateCanvasSize = React.useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  // Audio visualization
  const drawVisualization = React.useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const rect = canvas.getBoundingClientRect();
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current?.getByteFrequencyData(dataArray);

      // Scale for device pixel ratio
      const dpr = window.devicePixelRatio || 1;
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate bar width based on canvas width and buffer length
      const width = rect.width;
      const height = rect.height;
      const barWidth = (width / (bufferLength / 2)) * 0.8; // Show only half the frequencies
      const gap = 2; // Gap between bars
      let x = 0;

      // Draw frequency bars
      for (let i = 0; i < bufferLength / 2; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Create gradient for each bar
        const gradient = canvasCtx.createLinearGradient(
          0,
          height - barHeight * dpr,
          0,
          height
        );
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)'); // Blue-500
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0.7)'); // Blue-600

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(
          x * dpr,
          (height - barHeight) * dpr,
          barWidth * dpr,
          barHeight * dpr
        );

        x += barWidth + gap;
      }
    };

    draw();
  }, [isRecording]);

  // Initialize visualization when recording starts
  useEffect(() => {
    let resizeObserver: ResizeObserver;

    if (isRecording) {
      // Initial setup
      updateCanvasSize();
      drawVisualization();

      // Handle resize
      resizeObserver = new ResizeObserver(() => {
        updateCanvasSize();
      });

      if (canvasRef.current) {
        resizeObserver.observe(canvasRef.current);
      }

      // Start animation
      animationFrameRef.current = requestAnimationFrame(function animate() {
        drawVisualization();
        if (isRecording) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      });
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isRecording, drawVisualization, updateCanvasSize]);

  const sendToGroqWhisper = async (audioBlob: Blob) => {
    if (!activeProject?.settings.groqApiKey) {
      alert('Please set your GROQ API key in settings first');
      return;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-large-v3');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeProject.settings.groqApiKey}`,
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error transcribing audio: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.text) {
        onTranscriptionComplete(data.text);
      }
    } catch (err) {
      console.error('Error transcribing audio:', err);
      setIsProcessing(false);
      alert('Error transcribing audio. Please check your GROQ API key and try again.');
    }
  };

  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${isRecording ? 'text-red-500' : ''} hover:bg-accent hover:text-accent-foreground`}
          onClick={handleButtonClick}
          disabled={!activeProject?.settings.groqApiKey || isProcessing}
          title={activeProject?.settings.groqApiKey
            ? (isRecording ? 'Stop Recording' : 'Start Recording')
            : 'Set GROQ API key in settings to enable voice recording'}
        >
          <div className="relative">
            <Mic className="h-4 w-4" />
            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </Button>

        <Dialog
          open={isRecording}
          onOpenChange={(open) => {
            if (!open && isRecording) {
              stopRecording();
            }
          }}
        >
          <DialogContent>
            <DialogHeader className="pb-2">
              <DialogTitle className="sr-only">
                Voice Recording in Progress
              </DialogTitle>
              <div className="text-center">
                <h3 className="text-lg font-semibold">Listening</h3>
                <p className="text-sm text-muted-foreground">Tap anywhere to transcribe</p>
              </div>
            </DialogHeader>

            <div className="mt-2" onClick={stopRecording}>
              <canvas
                ref={canvasRef}
                className="w-full h-24 sm:h-32 bg-background border rounded-md"
                style={{ touchAction: 'none' }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};
