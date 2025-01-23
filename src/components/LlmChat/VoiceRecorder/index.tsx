import { useStore } from '@/stores/rootStore';
import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio context and analyser for visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
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

  // Audio visualization
  const drawVisualization = React.useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current?.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
      canvasCtx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      drawVisualization();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, drawVisualization]);

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
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${isRecording ? 'text-red-500' : ''} hover:bg-accent hover:text-accent-foreground`}
        onClick={isRecording ? stopRecording : startRecording}
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

      <Dialog open={isRecording} onOpenChange={(open) => !open && stopRecording()}>
        <DialogContent className="sm:max-w-[425px]" onPointerDown={stopRecording}>
          <DialogTitle asChild>
            <VisuallyHidden>Voice Recording in Progress</VisuallyHidden>
          </DialogTitle>
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold">Listening</h3>
            <p className="text-sm text-muted-foreground">Tap anywhere to transcribe</p>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full h-32 bg-gray-100 rounded-md"
            width={400}
            height={128}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
