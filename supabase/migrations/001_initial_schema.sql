-- =============================================
-- KaraokeFlow - Schema Initial
-- =============================================

-- Enum para roles de usuário
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- Enum para status de música
CREATE TYPE song_status AS ENUM ('pending', 'approved', 'rejected');

-- Enum para status de reprodução
CREATE TYPE play_status AS ENUM ('idle', 'playing', 'paused');

-- =============================================
-- Tabela: profiles
-- =============================================
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Tabela: songs
-- =============================================
CREATE TABLE songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    youtube_id TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    duration TEXT,
    requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status song_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Tabela: playlist
-- =============================================
CREATE TABLE playlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    position INTEGER NOT NULL,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(song_id)
);

-- =============================================
-- Tabela: player_state
-- =============================================
CREATE TABLE player_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    current_song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    current_position INTEGER DEFAULT 0,
    status play_status DEFAULT 'idle',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Tabela: approval_queue
-- =============================================
CREATE TABLE approval_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
    requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status song_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- =============================================
-- Índices
-- =============================================
CREATE INDEX idx_songs_requested_by ON songs(requested_by);
CREATE INDEX idx_songs_status ON songs(status);
CREATE INDEX idx_playlist_position ON playlist(position);
CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_requested_by ON approval_queue(requested_by);
