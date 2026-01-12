/**
 * Age Verification and Underage Detection
 * 
 * Policy:
 * - Do NOT proactively scan messages
 * - Act only on reports or explicit evidence
 * - If underage suspicion arises, immediately ban and log
 */

import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Check if user is 18+ based on date of birth
 */
export const isAdult = (dateOfBirth: string | Date | null): boolean => {
  if (!dateOfBirth) return false;
  
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
    ? age - 1 
    : age;
  
  return actualAge >= 18;
};

/**
 * Handle underage user detection based on report or evidence
 * This function should ONLY be called when there is explicit evidence
 * (e.g., user reported for being underage, or user admits to being underage)
 * 
 * Policy: Do NOT proactively scan - act only on reports or explicit evidence
 */
export const handleUnderageUser = async (
  userId: string,
  evidence: string,
  reportedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Get user's date of birth
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('date_of_birth, age_confirmed, full_name')
      .eq('id', String(userId))
      .single();

    if (profileError || !profile) {
      return { success: false, error: 'User not found' };
    }

    // Check if user is actually underage
    const isUnderage = profile.date_of_birth 
      ? !isAdult(profile.date_of_birth)
      : !profile.age_confirmed; // If no DOB but age_confirmed is false, treat as suspicious

    if (!isUnderage && profile.age_confirmed) {
      // User appears to be 18+, but we have evidence they're not
      // This is a case where user provided false information
      // Still ban them for providing false age data
    }

    // Immediately ban the account
    const { error: banError } = await supabase
      .from('profiles')
      .update({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_reason: `Underage user detected. Evidence: ${evidence}`,
      })
      .eq('id', String(userId));

    if (banError) {
      console.error('Error banning underage user:', banError);
      return { success: false, error: banError.message };
    }

    // Log the action with evidence
    await supabase
      .from('moderation_logs')
      .insert({
        moderator_id: null, // Automatic action
        target_user_id: String(userId),
        action_type: 'ban',
        reason: 'Underage user detected - immediate ban',
        details: {
          evidence: evidence,
          reported_by: reportedBy || null,
          date_of_birth: profile.date_of_birth,
          age_confirmed: profile.age_confirmed,
          user_name: profile.full_name,
        },
      });

    return { success: true };
  } catch (error) {
    console.error('Error handling underage user:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

/**
 * Verify age during registration
 * Returns true if user is 18+, false otherwise
 */
export const verifyAgeForRegistration = (dateOfBirth: string): { 
  isValid: boolean; 
  age?: number; 
  error?: string 
} => {
  if (!dateOfBirth) {
    return { isValid: false, error: 'Date of birth is required' };
  }

  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  
  // Check if date is in the future
  if (birthDate > today) {
    return { isValid: false, error: 'Date of birth cannot be in the future' };
  }

  // Check if date is too old (reasonable limit: 120 years)
  const maxAge = 120;
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - maxAge);
  if (birthDate < minDate) {
    return { isValid: false, error: 'Invalid date of birth' };
  }

  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
    ? age - 1 
    : age;

  if (actualAge < 18) {
    return { 
      isValid: false, 
      age: actualAge,
      error: 'Access is allowed only for users aged 18 and above' 
    };
  }

  return { isValid: true, age: actualAge };
};
