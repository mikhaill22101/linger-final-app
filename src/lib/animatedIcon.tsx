// Система анимированных иконок для маркеров на карте
// Использует lucide-react и framer-motion для создания микро-анимаций

import React from 'react';
import { motion } from 'framer-motion';
import type { IconType } from './smartIcon';

interface AnimatedIconProps {
  icon: IconType;
  animationType: 'swing' | 'pulse' | 'beat' | 'flicker' | 'none';
  size?: number;
  className?: string;
  color?: string;
}

// Анимации для разных типов
const animationVariants = {
  swing: {
    animate: {
      rotate: [0, 3, -3, 3, -3, 0],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },
  pulse: {
    animate: {
      scale: [1, 1.2, 1],
      y: [0, -4, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },
  beat: {
    animate: {
      scale: [1, 1.15, 1, 1.15, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },
  flicker: {
    animate: {
      opacity: [1, 0.7, 1, 0.8, 1],
      scale: [1, 1.1, 1, 1.05, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },
  none: {
    animate: {},
  },
};

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  icon,
  animationType,
  size = 12,
  className = '',
  color = 'white',
}) => {
  // Если иконка - строка (эмодзи), просто возвращаем её
  if (typeof icon === 'string') {
    return (
      <motion.span
        variants={animationVariants[animationType]}
        animate="animate"
        className={className}
        style={{
          fontSize: `${size}px`,
          lineHeight: 1,
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
          display: 'inline-block',
        }}
      >
        {icon}
      </motion.span>
    );
  }

  // Если иконка - React компонент (Lucide)
  const IconComponent = icon;
  return (
    <motion.div
      variants={animationVariants[animationType]}
      animate="animate"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconComponent
        size={size}
        strokeWidth={1.5}
        color={color}
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
        }}
      />
    </motion.div>
  );
};
