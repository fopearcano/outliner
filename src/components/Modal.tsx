import React, { useEffect } from 'react';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: 'center' | 'top';
}

export default function Modal({ onClose, children, className, align = 'center' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className={'overlay ' + (align === 'top' ? 'align-top' : '')} onMouseDown={onClose}>
      <div className={'modal ' + (className ?? '')} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
