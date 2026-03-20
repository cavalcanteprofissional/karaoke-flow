-- =============================================
-- KaraokeFlow - Row Level Security Policies
-- =============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Policies: profiles
-- =============================================

-- Usuários podem ver seus próprios perfis
CREATE POLICY "users_can_view_own_profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Qualquer usuário logado pode ver perfis (para exibir quem solicitou)
CREATE POLICY "authenticated_users_can_view_profiles"
    ON profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Usuários podem atualizar seus próprios perfis
CREATE POLICY "users_can_update_own_profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================
-- Policies: songs
-- =============================================

-- Qualquer usuário logado pode ver músicas aprovadas
CREATE POLICY "authenticated_can_view_approved_songs"
    ON songs FOR SELECT
    USING (
        status = 'approved' 
        OR auth.uid() = requested_by 
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Usuários logados podem inserir músicas (sempre como pending)
CREATE POLICY "authenticated_can_insert_songs"
    ON songs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Apenas admins podem atualizar músicas
CREATE POLICY "admin_can_update_songs"
    ON songs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Apenas admins podem deletar músicas
CREATE POLICY "admin_can_delete_songs"
    ON songs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- =============================================
-- Policies: playlist
-- =============================================

-- Qualquer usuário logado pode ver a playlist
CREATE POLICY "authenticated_can_view_playlist"
    ON playlist FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Apenas admins podem gerenciar a playlist
CREATE POLICY "admin_can_manage_playlist"
    ON playlist FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- =============================================
-- Policies: player_state
-- =============================================

-- Qualquer usuário logado pode ver o estado do player
CREATE POLICY "authenticated_can_view_player_state"
    ON player_state FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Apenas admins podem atualizar o estado do player
CREATE POLICY "admin_can_update_player_state"
    ON player_state FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- =============================================
-- Policies: approval_queue
-- =============================================

-- Usuários podem ver suas próprias solicitações
CREATE POLICY "users_can_view_own_approvals"
    ON approval_queue FOR SELECT
    USING (auth.uid() = requested_by);

-- Admins podem ver todas as solicitações
CREATE POLICY "admin_can_view_all_approvals"
    ON approval_queue FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Qualquer usuário logado pode criar solicitação de aprovação
CREATE POLICY "authenticated_can_create_approval"
    ON approval_queue FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Apenas admins podem atualizar aprovações
CREATE POLICY "admin_can_update_approvals"
    ON approval_queue FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
