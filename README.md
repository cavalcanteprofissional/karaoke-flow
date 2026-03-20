# KaraokeFlow 🎤

Sistema de karaokê online com YouTube integrado, autenticação e reprodução em tempo real.

![Next.js](https://img.shields.io/badge/Next.js-14+-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Realtime-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Funcionalidades

- **Autenticação**: Cadastro, login e logout com Supabase Auth
- **Perfis**: Usuário comum e Administrador
- **Busca YouTube**: Pesquise e solicite músicas diretamente
- **Playlist Pública**: Todos os usuários veem a mesma playlist
- **Aprovações**: Admin aprova/rejeita músicas solicitadas
- **Player**: Reprodução com YouTube IFrame API
- **Tempo Real**: Sincronização instantânea via Supabase Realtime
- **Controle Admin**: Play, pause, skip, reorder e remove

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta no [Supabase](https://supabase.com)
- Chave da [YouTube Data API v3](https://developers.google.com/youtube/v3)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/cavalcanteprofissional/karaoke-flow.git
cd karaoke-flow

# Instale as dependências
npm install

# Copie o arquivo de exemplo
cp .env.example .env.local
```

### Configuração

1. **Supabase**:
   - Crie um projeto em [supabase.com/dashboard](https://supabase.com/dashboard)
   - Vá em **Settings > API** e copie:
     - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon/public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

2. **YouTube API**:
   - Crie um projeto no [Google Cloud Console](https://console.cloud.google.com)
   - Habilite **YouTube Data API v3**
   - Crie uma **API Key** → `NEXT_PUBLIC_YOUTUBE_API_KEY`

3. **Execute os scripts SQL**:
   - No Supabase Dashboard, vá em **SQL Editor**
   - Execute os arquivos em `supabase/migrations/` na ordem:
     - `001_initial_schema.sql`
     - `002_rls_policies.sql`
     - `003_triggers.sql`

4. **Defina o Admin**:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'seu_email@exemplo.com';
   ```

5. **Edite `.env.local`** com suas credenciais

### Executando

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar produção
npm start
```

Acesse [http://localhost:3000](http://localhost:3000)

## 🏗️ Estrutura do Projeto

```
karaoke-flow/
├── src/
│   ├── app/              # Rotas (Next.js App Router)
│   │   ├── (auth)/      # Login, Register
│   │   ├── (dashboard)/ # Playlist, Player, Minhas Músicas
│   │   ├── admin/       # Painel Admin
│   │   └── api/         # API Routes
│   ├── components/       # Componentes React
│   ├── hooks/           # Hooks customizados
│   ├── lib/
│   │   ├── supabase/   # Cliente Supabase
│   │   └── youtube/     # Utilitários YouTube
│   ├── store/           # Zustand stores
│   └── types/           # TypeScript types
├── supabase/
│   └── migrations/      # Scripts SQL do banco
├── .env.example         # Template de variáveis
└── package.json
```

## 👥 Perfis de Usuário

| Recurso | Usuário | Admin |
|---------|---------|-------|
| Visualizar playlist | ✅ | ✅ |
| Solicitar músicas | ✅ | ✅ |
| Controlar player | ❌ | ✅ |
| Aprovar músicas | ❌ | ✅ |
| Reordenar playlist | ❌ | ✅ |
| Remover músicas | ❌ | ✅ |

## 🌐 API Routes

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/youtube/search` | GET | Busca vídeos no YouTube |
| `/api/youtube/player` | POST | Controle do player |
| `/api/playlist/reorder` | POST | Reordenar playlist |
| `/api/playlist/remove` | POST | Remover da playlist |
| `/api/admin/approve` | POST | Aprovar/rejeitar |

## 📦 Tech Stack

- **Frontend**: Next.js 14+, React 19, TypeScript
- **Estilização**: TailwindCSS, Shadcn/ui
- **Estado**: Zustand
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Player**: YouTube IFrame API
- **Hospedagem**: Vercel (recomendado)

## 🚢 Deploy

### Vercel (Recomendado)

1. Conecte seu repositório GitHub ao Vercel
2. Adicione as variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_YOUTUBE_API_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. Deploy!

### Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_projeto
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# YouTube
NEXT_PUBLIC_YOUTUBE_API_KEY=sua_chave_youtube_data_api

# App
NEXT_PUBLIC_APP_URL=https://seu-dominio.vercel.app
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Créditos

- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn/ui](https://ui.shadcn.com/)
- [Lucide Icons](https://lucide.dev/)

---

Feito com ❤️ para amantes de karaokê!
