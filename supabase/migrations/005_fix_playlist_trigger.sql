-- =============================================
-- KaraokeFlow - Correção Playlist e Trigger
-- Data: 24/03/2026
-- =============================================

-- =============================================
-- PASSO 1: Verificar estrutura atual
-- =============================================

-- Verificar se trigger existe
SELECT 
    tgname as trigger_name,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'on_song_status_change';

-- Verificar políticas da playlist
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'playlist';

-- Verificar se há músicas na playlist
SELECT * FROM playlist LIMIT 5;

-- =============================================
-- PASSO 2: Recriar Trigger de Aprovação
-- =============================================

-- Dropar trigger existente (se houver)
DROP TRIGGER IF EXISTS on_song_status_change ON songs;

-- Recriar função
CREATE OR REPLACE FUNCTION public.handle_song_approved()
RETURNS TRIGGER
AS $$
DECLARE
    max_position INTEGER;
BEGIN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        -- Obter próxima posição
        SELECT COALESCE(MAX(position), -1) + 1 INTO max_position FROM playlist;
        
        -- Adicionar à playlist
        INSERT INTO playlist (song_id, position)
        VALUES (NEW.id, max_position)
        ON CONFLICT (song_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger
CREATE TRIGGER on_song_status_change
    AFTER UPDATE ON songs
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status = 'pending')
EXECUTE FUNCTION public.handle_song_approved();

-- =============================================
-- PASSO 3: Corrigir Políticas RLS para playlist
-- =============================================

-- Verificar se usuário admin existe e tem role='admin'
SELECT id, email, role FROM profiles WHERE role = 'admin';

-- Dropar políticas antigas
DROP POLICY IF EXISTS "authenticated_can_view_playlist" ON playlist;
DROP POLICY IF EXISTS "admin_can_manage_playlist" ON playlist;

-- Criar políticas mais permissivas para desenvolvimento

-- Política 1: SELECT - Todos usuários autenticados veem a playlist
CREATE POLICY "playlist_select_policy"
ON playlist
FOR SELECT
USING (auth.role() = 'authenticated');

-- Política 2: INSERT - Qualquer usuário logado pode adicionar (para testing)
-- Em produção, mudar para usar função de admin
CREATE POLICY "playlist_insert_policy"
ON playlist
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Política 3: UPDATE - Admins podem atualizar
CREATE POLICY "playlist_update_policy"
ON playlist
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Política 4: DELETE - Admins podem deletar
CREATE POLICY "playlist_delete_policy"
ON playlist
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- =============================================
-- PASSO 4: Testar Trigger
-- =============================================

-- Simular aprovação de uma música (para teste)
-- Substitua o ID pela música que quer testar
-- UPDATE songs SET status = 'pending' WHERE id = 'ID_AQUI';

-- Verificar se músicas approved existem
SELECT id, title, status FROM songs WHERE status = 'approved';

-- Forçar trigger para músicas já aprovadas (one-time fix)
UPDATE songs 
SET status = status 
WHERE status = 'approved';

-- Ver playlist após execução
SELECT p.id, p.song_id, p.position, s.title 
FROM playlist p
JOIN songs s ON p.song_id = s.id
ORDER BY p.position;

-- =============================================
-- INSTRUÇÕES
-- =============================================
--
-- 1. Execute todo o script no SQL Editor do Supabase
-- 2. O trigger irá adicionar músicas aprovadas à playlist automaticamente
-- 3. Para testar: faça uma nova solicitação de música e aprove
-- 4. Verifique se a música aparece na playlist
--
-- =============================================
