import { useStore } from '@/stores/rootStore';
import { Button } from '@/components/ui/button';
import { Mic } from 'lucide-react';
import React, { useState, useRef } from 'react';

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onTranscriptionComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { projects, activeProjectId } = useStore();
  const activeProject = projects.find(p => p.id === activeProjectId);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        await sendToGroqWhisper(audioBlob);
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
    }
  };

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
      alert('Error transcribing audio. Please check your GROQ API key and try again.');
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`${isRecording ? 'text-red-500' : ''} hover:bg-accent hover:text-accent-foreground`}
      onClick={isRecording ? stopRecording : startRecording}
      disabled={!activeProject?.settings.groqApiKey}
      title={activeProject?.settings.groqApiKey
        ? (isRecording ? 'Stop Recording' : 'Start Recording')
        : 'Set GROQ API key in settings to enable voice recording'}
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
};
