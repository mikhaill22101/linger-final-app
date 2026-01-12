/**
 * Premium Crown Icon Component
 * 
 * Simple, abstract gold crown icon for premium status indication.
 * - NOT an emoji
 * - NOT copyrighted artwork
 * - Abstract design
 * - Visible only to the user in their own profile
 */

import React from 'react';

interface PremiumCrownIconProps {
  size?: number;
  className?: string;
}

export const PremiumCrownIcon: React.FC<PremiumCrownIconProps> = ({ 
  size = 20, 
  className = '' 
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Premium"
    >
      {/* Abstract crown shape - simple geometric design */}
      <path
        d="M12 4L8 8L6 6L4 10L2 8L3 18L21 18L22 8L20 10L18 6L16 8L12 4Z"
        fill="url(#crownGradient)"
        stroke="url(#crownGradientStroke)"
        strokeWidth="0.5"
      />
      {/* Decorative circles */}
      <circle cx="8" cy="12" r="1.5" fill="#FFD700" opacity="0.8" />
      <circle cx="12" cy="10" r="1.5" fill="#FFD700" opacity="0.9" />
      <circle cx="16" cy="12" r="1.5" fill="#FFD700" opacity="0.8" />
      <defs>
        <linearGradient id="crownGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#FF8C00" />
        </linearGradient>
        <linearGradient id="crownGradientStroke" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFED4E" />
          <stop offset="100%" stopColor="#FFA500" />
        </linearGradient>
      </defs>
    </svg>
  );
};
