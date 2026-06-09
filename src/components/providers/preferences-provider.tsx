'use client';

import { createContext, useContext } from 'react';
import type { UserPreferences } from '@/types/app';

interface PreferencesContextValue {
  timezone:    string;
  dateFormat:  string;
  timeFormat:  '12h' | '24h';
  language:    string;
}

const DEFAULT: PreferencesContextValue = {
  timezone:   'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  language:   'en',
};

const PreferencesContext = createContext<PreferencesContextValue>(DEFAULT);

export function PreferencesProvider({
  preferences,
  children,
}: {
  preferences: UserPreferences | null;
  children:    React.ReactNode;
}) {
  const value: PreferencesContextValue = {
    timezone:   preferences?.timezone   ?? DEFAULT.timezone,
    dateFormat: preferences?.date_format ?? DEFAULT.dateFormat,
    timeFormat: (preferences?.time_format as '12h' | '24h') ?? DEFAULT.timeFormat,
    language:   preferences?.language   ?? DEFAULT.language,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
