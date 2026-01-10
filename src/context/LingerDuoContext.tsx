import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LingerDuoContextType {
  isDuoMode: boolean;
  activateDuoMode: () => void;
  deactivateDuoMode: () => void;
}

const LingerDuoContext = createContext<LingerDuoContextType | undefined>(undefined);

export const useLingerDuo = () => {
  const context = useContext(LingerDuoContext);
  if (!context) {
    throw new Error('useLingerDuo must be used within LingerDuoProvider');
  }
  return context;
};

interface LingerDuoProviderProps {
  children: ReactNode;
}

export const LingerDuoProvider: React.FC<LingerDuoProviderProps> = ({ children }) => {
  const [isDuoMode, setIsDuoMode] = useState(false);

  const activateDuoMode = () => {
    setIsDuoMode(true);
    // Haptic feedback при активации
    if (window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
      } catch (e) {
        console.warn('Haptic error:', e);
      }
    }
  };

  const deactivateDuoMode = () => {
    setIsDuoMode(false);
    // Haptic feedback при деактивации
    if (window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      } catch (e) {
        console.warn('Haptic error:', e);
      }
    }
  };

  return (
    <LingerDuoContext.Provider value={{ isDuoMode, activateDuoMode, deactivateDuoMode }}>
      {children}
    </LingerDuoContext.Provider>
  );
};
