-- =============================================
-- KaraokeFlow - Seed Data
-- =============================================

-- Observação: Execute este arquivo após criar o projeto no Supabase
-- e após ter criado o usuário admin pelo painel do Supabase.

-- Para definir um usuário como admin, substitua o email abaixo
-- e execute:
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@exemplo.com';

-- =============================================
-- Dados de exemplo para teste
-- =============================================

-- Exemplo de música aprovada (para testar a playlist)
-- INSERT INTO songs (youtube_id, youtube_url, title, thumbnail, requested_by, status)
-- VALUES (
--     'dQw4w9WgXcQ',
--     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
--     'Rick Astley - Never Gonna Give You Up',
--     'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
--     NULL,
--     'approved'
-- );

-- INSERT INTO playlist (song_id, position)
-- SELECT id, 0 FROM songs WHERE youtube_id = 'dQw4w9WgXcQ'
-- ON CONFLICT (song_id) DO NOTHING;
