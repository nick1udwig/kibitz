import React from 'react';
import { Switch } from '@/components/ui/switch';

interface HistoryToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const HistoryToggle: React.FC<HistoryToggleProps> = ({ checked, onChange }) => {
  return (
    <div className="fixed right-4 bottom-16 z-[60] flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-lg border border-input">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-[10px] text-muted-foreground leading-none">History</span>
    </div>
  );
};