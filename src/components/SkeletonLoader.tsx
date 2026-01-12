/**
 * Skeleton Loader Component
 * 
 * Provides neutral, non-intrusive loading placeholders.
 * - No progress bars
 * - Neutral colors
 * - Shape matches final content
 * 
 * Apple App Store / Google Play Compliance:
 * - No tracking or analytics
 * - Pure visual placeholder
 */

import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonLoaderProps {
  className?: string;
  shape?: 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  className = '',
  shape = 'rect',
  width = '100%',
  height = '100%',
}) => {
  const baseClasses = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
  
  return (
    <motion.div
      className={`${baseClasses} bg-white/5 ${className}`}
      style={{ width, height }}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.7, 0.5] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
};

/**
 * Avatar Skeleton Loader
 * 
 * Specific skeleton for profile photo loading
 */
export const AvatarSkeleton: React.FC<{ size?: number }> = ({ size = 64 }) => {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <SkeletonLoader
        shape="circle"
        width={size}
        height={size}
        className="absolute inset-0"
      />
    </div>
  );
};
