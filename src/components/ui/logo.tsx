import React from 'react';
import { Ticket } from 'lucide-react';

interface LogoProps {
  variant?: 'default' | 'compact' | 'footer' | 'large';
  className?: string;
  showText?: boolean;
}

const Logo = ({
  variant = 'default',
  className = '',
  showText = true
}: LogoProps) => {
  const getIconSize = () => {
    switch (variant) {
      case 'compact': return 'w-8 h-8';
      case 'footer': return 'w-20 h-20';
      case 'large': return 'w-32 h-32';
      default: return 'w-14 h-14';
    }
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img src="/logo_512x512.png" alt="A2 Tickets 360º" className={`${getIconSize()} object-contain`} />
    </div>
  );
};

export default Logo;
