export type UserRole = "user" | "admin";
export type SongStatus = "pending" | "approved" | "rejected";
export type PlayStatus = "idle" | "playing" | "paused";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Song {
  id: string;
  youtube_id: string;
  youtube_url: string;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  requested_by: string | null;
  status: SongStatus;
  created_at: string;
  updated_at: string;
  // Relations
  profiles?: Profile;
  playlist?: PlaylistItem[];
}

export interface PlaylistItem {
  id: string;
  song_id: string;
  position: number;
  added_by: string | null;
  created_at: string;
  // Relations
  songs?: Song;
}

export interface PlayerState {
  id: string;
  current_song_id: string | null;
  current_position: number;
  status: PlayStatus;
  updated_at: string;
  // Relations
  songs?: Song;
}

export interface ApprovalQueueItem {
  id: string;
  song_id: string;
  requested_by: string | null;
  status: SongStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Relations
  songs?: Song;
  profiles?: Profile;
  reviewer?: Profile;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id">>;
      };
      songs: {
        Row: Song;
        Insert: Omit<Song, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Song, "id">>;
      };
      playlist: {
        Row: PlaylistItem;
        Insert: Omit<PlaylistItem, "id" | "created_at">;
        Update: Partial<Omit<PlaylistItem, "id">>;
      };
      player_state: {
        Row: PlayerState;
        Insert: Omit<PlayerState, "updated_at">;
        Update: Partial<Omit<PlayerState, "id">>;
      };
      approval_queue: {
        Row: ApprovalQueueItem;
        Insert: Omit<ApprovalQueueItem, "id" | "created_at">;
        Update: Partial<Omit<ApprovalQueueItem, "id">>;
      };
    };
  };
}
