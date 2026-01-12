import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { ModeFilterType } from '../components/ModeFilter';
import { trackEvent } from '../lib/analytics';

interface LingerDuoContextType {
  modeFilter: ModeFilterType;
  setModeFilter: (mode: ModeFilterType) => void;
  isDuoMode: boolean; // Deprecated: use modeFilter === 'together' instead
  activateDuoMode: () => void; // Deprecated: use setModeFilter('together')
  deactivateDuoMode: () => void; // Deprecated: use setModeFilter('group')
  isTogetherMode: () => boolean;
  isGroupMode: () => boolean;
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
  // Load saved mode filter from localStorage
  const loadSavedModeFilter = (): ModeFilterType => {
    try {
      const saved = localStorage.getItem('linger_mode_filter');
      if (saved === 'group' || saved === 'together' || saved === 'both') {
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load saved mode filter:', e);
    }
    return 'both'; // Default: show both
  };

  const [modeFilter, setModeFilterState] = useState<ModeFilterType>(loadSavedModeFilter());

  // Save mode filter to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('linger_mode_filter', modeFilter);
    } catch (e) {
      console.warn('Failed to save mode filter:', e);
    }
  }, [modeFilter]);

  const setModeFilter = (mode: ModeFilterType) => {
    setModeFilterState(mode);
    trackEvent('mode_switch_filter_changed', { mode, method: 'filter' });
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      } catch (e) {
        console.warn('Haptic error:', e);
      }
    }
  };

  // Legacy support for isDuoMode
  const isDuoMode = modeFilter === 'together';
  
  const activateDuoMode = () => {
    setModeFilter('together');
  };

  const deactivateDuoMode = () => {
    setModeFilter('group');
  };

  const isTogetherMode = () => modeFilter === 'together';
  const isGroupMode = () => modeFilter === 'group';

  return (
    <LingerDuoContext.Provider value={{ 
      modeFilter, 
      setModeFilter,
      isDuoMode, // Legacy support
      activateDuoMode, // Legacy support
      deactivateDuoMode, // Legacy support
      isTogetherMode,
      isGroupMode,
    }}>
      {children}
    </LingerDuoContext.Provider>
  );
};
