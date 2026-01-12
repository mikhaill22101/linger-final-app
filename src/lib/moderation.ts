/**
 * Moderation System
 * Handles reports, blocking, and moderation actions
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type ReportReason = 
  | 'spam' 
  | 'harassment' 
  | 'explicit_content' 
  | 'commercial_activity' 
  | 'illegal_activity' 
  | 'other';

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: ReportReason;
  description?: string;
  context_url?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

/**
 * Submit a report against a user
 */
export const submitReport = async (
  reportedUserId: string,
  reason: ReportReason,
  description?: string,
  contextUrl?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: String(user.id),
        reported_user_id: String(reportedUserId),
        reason,
        description: description || null,
        context_url: contextUrl || null,
      });

    if (error) {
      console.error('Error submitting report:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting report:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

/**
 * Block a user
 */
export const blockUser = async (
  userIdToBlock: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('blocked_users')
      .insert({
        blocker_id: String(user.id),
        blocked_id: String(userIdToBlock),
      });

    if (error) {
      // Ignore duplicate key errors (user already blocked)
      if (error.code !== '23505') {
        console.error('Error blocking user:', error);
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error blocking user:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (
  userIdToUnblock: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', String(user.id))
      .eq('blocked_id', String(userIdToUnblock));

    if (error) {
      console.error('Error unblocking user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error unblocking user:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

/**
 * Check if a user is blocked
 */
export const isUserBlocked = async (
  userId: string
): Promise<boolean> => {
  if (!isSupabaseConfigured) {
    return false;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', String(user.id))
      .eq('blocked_id', String(userId))
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking block status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking block status:', error);
    return false;
  }
};

/**
 * Get list of blocked users
 */
export const getBlockedUsers = async (): Promise<BlockedUser[]> => {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', String(user.id));

    if (error) {
      console.error('Error fetching blocked users:', error);
      return [];
    }

    return (data || []).map(block => ({
      id: block.id,
      blocker_id: String(block.blocker_id),
      blocked_id: String(block.blocked_id),
      created_at: block.created_at,
    }));
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    return [];
  }
};

/**
 * Get user's reports (for admin/moderator)
 */
export const getUserReports = async (
  userId: string
): Promise<Report[]> => {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('reported_user_id', String(userId))
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reports:', error);
      return [];
    }

    return (data || []).map(report => ({
      id: report.id,
      reporter_id: String(report.reporter_id),
      reported_user_id: String(report.reported_user_id),
      reason: report.reason,
      description: report.description,
      context_url: report.context_url,
      status: report.status,
      created_at: report.created_at,
    }));
  } catch (error) {
    console.error('Error fetching reports:', error);
    return [];
  }
};
