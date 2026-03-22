-- =============================================
-- KaraokeFlow - Correção de RLS
-- Data: 22/03/2026
-- =============================================

-- =============================================
-- PASSO 1: Tornar usuário Admin
-- SUBSTITUA 'seu_email@exemplo.com' pelo email do usuário admin
-- =============================================

-- Opção 1: Tornar usuário específico como admin
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'SEU_EMAIL_AQUI@exemplo.com';

-- Opção 2: Verificar se foi atualizado
SELECT id, email, role FROM profiles WHERE role = 'admin';

-- =============================================
-- PASSO 2: Corrigir Políticas RLS para approval_queue
-- 
-- PROBLEMA: Políticas atuais permitem ver apenas próprias solicitações
-- SOLUÇÃO: Permitir que todos os usuários autenticados vejam todas as aprovações
-- =============================================

-- Habilitar RLS na tabela
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

-- REMOVER políticas antigas
DROP POLICY IF EXISTS "users_can_view_own_approvals" ON approval_queue;
DROP POLICY IF EXISTS "admin_can_view_all_approvals" ON approval_queue;
DROP POLICY IF EXISTS "authenticated_can_create_approval" ON approval_queue;
DROP POLICY IF EXISTS "admin_can_update_approvals" ON approval_queue;

-- =============================================
-- NOVAS POLÍTICAS
-- =============================================

-- Política 1: SELECT - Todos os usuários autenticados veem TODAS as aprovações
CREATE POLICY "authenticated_can_view_all_approvals"
ON approval_queue
FOR SELECT
USING (auth.role() = 'authenticated');

-- Política 2: INSERT - Usuários autenticados podem criar solicitações
CREATE POLICY "authenticated_can_insert_approval"
ON approval_queue
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Política 3: UPDATE - Apenas admins podem atualizar aprovações
CREATE POLICY "admin_can_update_approval"
ON approval_queue
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Política 4: DELETE - Apenas admins podem deletar aprovações
CREATE POLICY "admin_can_delete_approval"
ON approval_queue
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- =============================================
-- PASSO 3: Corrigir Políticas RLS para songs
-- =============================================

-- REMOVER políticas antigas
DROP POLICY IF EXISTS "authenticated_can_view_approved_songs" ON songs;
DROP POLICY IF EXISTS "authenticated_can_insert_songs" ON songs;
DROP POLICY IF EXISTS "admin_can_update_songs" ON songs;
DROP POLICY IF EXISTS "admin_can_delete_songs" ON songs;

-- Política 1: SELECT - Todos veem músicas
CREATE POLICY "authenticated_can_view_songs"
ON songs
FOR SELECT
USING (auth.role() = 'authenticated');

-- Política 2: INSERT - Usuários podem inserir músicas
CREATE POLICY "authenticated_can_insert_songs"
ON songs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Política 3: UPDATE - Apenas admins podem atualizar
CREATE POLICY "admin_can_update_songs"
ON songs
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Política 4: DELETE - Apenas admins podem deletar
CREATE POLICY "admin_can_delete_songs"
ON songs
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- =============================================
-- PASSO 4: Verificar estrutura atual
-- =============================================

-- Ver músicas pendentes
SELECT s.id, s.title, s.status, s.requested_by, p.full_name
FROM songs s
LEFT JOIN profiles p ON s.requested_by = p.id
WHERE s.status = 'pending';

-- Ver fila de aprovação
SELECT a.id, a.status, s.title, p.full_name
FROM approval_queue a
JOIN songs s ON a.song_id = s.id
LEFT JOIN profiles p ON a.requested_by = p.id
WHERE a.status = 'pending';

-- Ver políticas aplicadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('approval_queue', 'songs');

-- =============================================
-- INSTRUÇÕES DE USO
-- =============================================
--
-- 1. Substitua 'SEU_EMAIL_AQUI@exemplo.com' pelo email do admin
-- 2. Execute todo o script no SQL Editor do Supabase
-- 3. Teste o painel de aprovações em /administracao/approvals
--
-- =============================================
