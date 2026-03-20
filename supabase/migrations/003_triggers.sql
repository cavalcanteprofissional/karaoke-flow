-- =============================================
-- KaraokeFlow - Triggers
-- =============================================

-- =============================================
-- Trigger: Criar profile ao criar usuário
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar profile automaticamente
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- Trigger: Atualizar updated_at em profiles
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_songs_updated_at
    BEFORE UPDATE ON songs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_player_state_updated_at
    BEFORE UPDATE ON player_state
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- Trigger: Reordenar playlist automaticamente
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_playlist_change()
RETURNS TRIGGER
AS $$
BEGIN
    -- Reordenar posições após inserção ou atualização
    UPDATE playlist 
    SET position = new_position
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 as new_position
        FROM playlist
    ) as positions
    WHERE playlist.id = positions.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Trigger: Ao aprovar música, adicionar à playlist
-- =============================================
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

CREATE OR REPLACE TRIGGER on_song_status_change
    AFTER UPDATE ON songs
    FOR EACH ROW EXECUTE FUNCTION public.handle_song_approved();

-- =============================================
-- Seed: Criar player_state inicial
-- =============================================
INSERT INTO player_state (id, status) 
VALUES ('main', 'idle')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- Seed: Criar admin padrão (substituir email)
-- =============================================
-- Para criar o admin, execute após criar o usuário admin:
-- UPDATE profiles SET role = 'admin' WHERE email = 'seu_email_admin@exemplo.com';
