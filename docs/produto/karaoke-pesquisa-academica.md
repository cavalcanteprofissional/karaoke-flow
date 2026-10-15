# Pesquisa Acadêmica e de Mercado — Karaokê, Sistemas de Música Colaborativos e Watch Parties

## 1. Objetivo deste documento

Este arquivo reúne, com cunho acadêmico-investigativo, o estado da arte relevante para o projeto de karaokê watch party: (a) contexto histórico e sociocultural do karaokê; (b) pesquisa em Interação Humano-Computador (IHC/HCI) sobre filas musicais colaborativas e reprodução sincronizada em grupo; (c) mapeamento de aplicativos e softwares atualmente no mercado, tanto para o consumidor final quanto para hosts profissionais (KJs) e venues; (d) restrições técnicas documentadas da YouTube Data API relevantes ao domínio; e (e) uma bibliografia consolidada. O documento complementa — mas não substitui — a especificação técnica de requisitos já produzida (`karaoke-watch-party-spec.md`); serve como base de fundamentação e como fonte para aprofundamento contínuo do projeto.

## 2. Karaokê: origem, evolução e papel sociocultural

O karaokê (do japonês *kara*, "vazio", e *okesutora*, "orquestra") foi inventado em 1971 pelo músico japonês Daisuke Inoue, em Kobe, como resposta prática a um problema operacional: ele tocava teclado como acompanhamento ao vivo para clientes de bares que queriam cantar, e criou uma máquina — o "8 Juke" — capaz de reproduzir faixas instrumentais sob demanda, eliminando a necessidade de um músico presente (Inoue, apud Open Culture, 2021; Wikipedia, 2026). Inoue nunca patenteou a invenção, o que contribuiu para sua rápida disseminação e para a ausência de um "dono" comercial único da tecnologia original.

O karaokê é estudado por sua função de coesão social: a prática é descrita na literatura de cultura popular e em análises jornalísticas/históricas como um mecanismo de "quebra-gelo" que reduz inibições e cria vínculo entre pares, colegas de trabalho e desconhecidos, a ponto de o Comitê do Ig Nobel Prize (2004) tê-lo descrito como "uma forma inteiramente nova de as pessoas aprenderem a tolerar umas às outras" (Open Culture, 2021). O fenômeno também é associado a um mercado expressivo: estima-se que bares de karaokê nos EUA movimentaram US$ 435 milhões em receita em 2017, e a indústria japonesa já ultrapassou US$ 7 bilhões/ano em períodos de pico (Missed History, 2025; Grokipedia, 2026).

Do ponto de vista tecnológico, a evolução do karaokê passou por fases relevantes ao contexto deste projeto: máquinas de fita 8-track (anos 1970) → discos a laser/CD+G com letras sincronizadas (anos 1980-90) → arquivos digitais MP3+G e MIDI karaokê tocados por software de host em laptop (anos 2000) → plataformas em nuvem/streaming e aplicativos móveis, incluindo o uso direto de faixas de karaokê hospedadas no YouTube como fonte de conteúdo (2010s em diante) — este último é exatamente o ponto de partida técnico do projeto aqui documentado.

## 3. Sistemas de Informação aplicados à música e ao entretenimento ao vivo

Do ponto de vista de Sistemas de Informação, uma aplicação de karaokê watch party é um sistema sociotécnico com três subsistemas interdependentes: (1) um subsistema de **identidade e controle de acesso** (quem pode entrar em qual sala, com qual papel); (2) um subsistema de **gestão de fila/estado compartilhado** (a playlist como um recurso concorrente, disputado por múltiplos atores simultâneos); e (3) um subsistema de **reprodução distribuída** (um "produtor" de eventos — o host/fila — e um "consumidor" de eventos — a tela de exibição — desacoplados fisicamente e sincronizados por um canal de tempo real). Essa separação produtor/consumidor com estado compartilhado é estruturalmente análoga a sistemas de fila (*queueing systems*) estudados em pesquisa operacional e em sistemas distribuídos, onde a ordem de atendimento, a política de admissão (aberta vs. moderada) e a justiça de rotação (round-robin entre cantores) são parâmetros de design com impacto direto na experiência do usuário — tema que aparece de forma recorrente na literatura de HCI sobre jukeboxes sociais discutida na seção 5.

## 4. Watch Party e Reprodução Sincronizada — pesquisa relacionada

O termo "watch party" descreve a prática de sincronizar a reprodução de conteúdo de vídeo entre múltiplos dispositivos/telas para uma audiência compartilhada, com ou sem coincidência espacial dos participantes. A prática ganhou tração massiva durante a pandemia de COVID-19, quando serviços como Teleparty (ex-Netflix Party) e Scener popularizaram a sincronização remota de streaming (Variety, 2020; Viaccess-Orca, 2022). Um levantamento de mercado indica que a sincronização é o requisito técnico crítico do modelo: se os participantes divergem de timestamp (por buffering ou navegação manual), a experiência social do watch party se rompe (StreamLayer, 2026) — um requisito diretamente aplicável à sala de karaokê, ainda que aqui a sincronização seja entre um único player físico (a TV/projetor) e múltiplos controllers, e não entre múltiplos players de vídeo.

Uma patente de utilidade dos EUA (US 11,206,443 B1) descreve um método de sincronização de reprodução de vídeo de terceiros entre dispositivos de participantes via troca de sinais de modificação de playback — evidência de que a sincronização de estado de reprodução entre um "controlador" e um "player" remoto é um problema tecnicamente não trivial e ativamente protegido por propriedade intelectual no mercado de watch parties (USPTO, sem data de publicação pública detalhada).

No campo acadêmico, Chen & Liao (2022), publicado na *Frontiers in Psychology*, aplicam a Teoria da Presença Social para explicar por que espectadores continuam assistindo lives em grupo: os autores encontraram, com dados de 386 respondentes analisados via modelagem de equações estruturais, que senso de comunidade, interatividade e suporte emocional influenciam positivamente a presença social percebida, a qual por sua vez impulsiona o engajamento com a transmissão — achado transferível ao contexto do karaokê ao vivo, em que a "audiência" da sala também participa ativamente da experiência coletiva. Já Lu et al. (arXiv:1803.06032) analisam práticas de live streaming na China e discutem como a interação síncrona em larga escala influencia o engajamento entre espectadores e streamers, fundamentando teoricamente por que a interface da tela compartilhada (fila visível, próximo cantor, etc.) não é apenas informativa, mas também um mecanismo de engajamento social.

## 5. Filas Colaborativas, Playlists Compartilhadas e Escolha Musical em Grupo — pesquisa relacionada

Esta é a linha de pesquisa em HCI mais diretamente aplicável ao núcleo do produto — a fila musical compartilhada de uma sala.

- **Jukola** (O'Hara, Lipson, Jansen, Unger, Jeffries & Macer, 2004; *Proceedings of DIS '04*, ACM, DOI 10.1145/1013115.1013136) é a referência mais próxima conceitualmente do projeto: um jukebox interativo instalado em um café-bar real, em que um display público exibe músicas nominadas e os frequentadores votam nelas por dispositivos portáteis em rede — ou seja, ninguém tem controle unilateral da fila, e a música tocada é resultado de um processo coletivo. O estudo de campo relatou que o valor do sistema não estava apenas no resultado musical democrático, mas no processo social gerado ao redor da escolha: discussões sobre música, competição lúdica, gestão de identidade e senso de comunidade entre os presentes fisicamente no mesmo espaço.
- **MusicFX** (McCarthy & Anagnost, 1998; *CSCW '98*) é um antecedente histórico: um sistema de arbitragem de preferências musicais de grupo para uma academia de ginástica, no qual os usuários influenciam — mas não controlam diretamente — a seleção musical do ambiente compartilhado.
- **PartyVote** (Sprague, Wu & Tory) é descrito na literatura subsequente como um jukebox democrático que usa redução de dimensionalidade para exibir similaridade entre músicas e sobrepor informações sobre como os votos afetam a música tocada — uma evolução direta da linha de pesquisa aberta pelo Jukola.
- Um estudo mencionado na mesma linha (catalogado via Semantic Scholar) descreve pesquisa mista sobre "*social jukeboxing*", analisando satisfação dos ouvintes e percepções sobre conflito e mecanismos de gestão de conflito em contextos de jukebox social — tema central para o projeto, já que o toggle de aprovação manual de fila é, na prática, um mecanismo de gestão de conflito.
- **Social Playlist** (Bassoli, Moore & Agamanolis; *MobileHCI 2008*, DOI 10.1145/1409240.1409299) reporta o design e teste de campo de um canal musical colaborativo móvel entre amigos, com achados sobre autoexpressão, descoberta social e pontos de contato ("touch points") gerados pela curadoria compartilhada, além de tensões que emergem quando preferências musicais divergem dentro do grupo.
- **Queue Player** (Pinder, Odom, Yoo, Misra, Lin, Neustaedter & Barnett; *CHI 2025*, DOI 10.1145/3706598.3714293) investiga experiências de co-audição distribuída combinando históricos de escuta de amigos próximos, relevante à discussão de como um histórico de fila compartilhado (quem pediu o quê) pode se tornar, por si, um artefato social.
- **"Tunes Together"** (ISMIR 2019) e **"Social Music Curation That Works"** (*Proceedings of the ACM on Human-Computer Interaction*, CSCW1, DOI 10.1145/3449191) analisam playlists colaborativas em uso real, observando variação por tamanho de grupo, propósito, contexto de escuta e comportamento de engajamento — achados aplicáveis ao desenho de papéis (host vs. participante) e à decisão de permitir ou não reordenação da fila por não-hosts.
- **"Hitting Pause"** (CHI 2022, DOI 10.1145/3491102.3517604) estuda como percepções de usuários sobre playlists colaborativas evoluíram durante a pandemia de COVID-19, destacando maior tolerância a ordenação aleatória e falta de coesão musical quando o objetivo é conexão social, e não curadoria estética — um argumento a favor de não superengenheirar regras de "qualidade" da fila em detrimento da participação.
- **Spotify Jam / Spotify Blend** — recursos comerciais de fila colaborativa em tempo real (até 32 participantes simultâneos no Jam) e de geração de playlist compartilhada por afinidade entre dois usuários (Blend), este último estudado formalmente em Kwak, Park, Cha, Kim & Lim (2024; *CHI 2024*, DOI 10.1145/3613904.3642544), que investigam sistemas de recomendação em grupo como meio de interação social.
- **Gabbolini & Bridge (2024)**, *ACM Transactions on Intelligent Systems and Technology*, revisam mais de duas décadas de pesquisa em Music Information Retrieval (MIR) sobre playlists — referência útil caso o projeto evolua para recomendação automática de músicas na fila.

## 6. Panorama de Aplicativos de Karaokê Atuais (mercado)

### 6.1 Apps de canto/performance voltados ao consumidor final

| App | Posicionamento | Características relevantes |
|---|---|---|
| **Smule** | Rede social de canto, +200 milhões de usuários | Duetos em tempo real com desconhecidos ou celebridades, feed social, gravação e compartilhamento, "Sing Together" |
| **KaraFun** | Karaokê para casa/festa e uso comercial | ~55.000 músicas licenciadas, sincronização offline, ajuste de tom/tempo, apps para TV (Apple TV, Android TV, Fire TV), plano Pro com licença comercial |
| **Singa** | Karaokê licenciado, foco em qualidade de catálogo | +80.000 músicas, "Singa Originals" (gravações de artista original, não covers), player redesenhado em 2026 com fila mais fluida |
| **Yokee** | Karaokê casual/iniciante | +100 milhões de downloads, guia vocal em tempo real, criação de "salas de karaokê" para cantar junto remotamente |
| **StarMaker** | Performance social com presentes virtuais | Streaming de karaokê ao vivo com interação de audiência e economia de "gifting" |
| **WeSing** | Concorrente regional de canto social | Modelo similar a StarMaker/Smule, com variações de precificação por região |

Uma análise comparativa recente de mercado (Unstar, 2026) resume o critério de escolha entre esses apps como uma questão de "quão social" o usuário quer ser: Smule/StarMaker para comunidade e duetos; Yokee/Singa para uma experiência mais tranquila e sem economia de presentes; apps licenciados no estilo Singa como opção mais segura legalmente para hospedar karaokê para terceiros.

### 6.2 Softwares/plataformas para hosts profissionais (KJs) e venues

Este segmento é o mais próximo funcionalmente do projeto, pois já resolve — com abordagens variadas — o problema central de "fila compartilhada controlada por um host, com pedidos remotos de terceiros":

- **Siglos Karaoke Professional** — software de KJ com rotação automática de cantores, tela dupla (uma para o cantor, outra para o host), anúncios automáticos de "próximo a cantar", e um complemento (*ConnectKaraoke*) que permite pedidos remotos via smartphone do público.
- **PCDJ Karaoki** — sistema de rotação de mais de 30 cantores por noite, com complemento *SongbookDB* para pedidos remotos pela internet e um único clique do host para aprovar e mandar para a rotação.
- **CompuHost** — foco em pedidos remotos ("Remote Song Queuing") diretamente do celular do cliente, suporte a múltiplos monitores (letra em uma tela, visual/publicidade em outra).
- **Singa Business Pro** — os pedidos dos clientes chegam direto à fila do host em um iPad, com reordenação por arrastar-e-soltar; citada explicitamente como solução voltada a bares com KJ.
- **LYRX / kJams** — sistemas com app companheiro para o próprio cantor gerenciar sua posição na fila (*kJams Cue*), e histórico de cantores por playlists (`Tonight`, `Favorites`, `History`).
- **KJDeluxe** — inclui um "KSR" (Karaoke Singer Request), um web app que permite catálogo online de até 100.000 músicas para pedidos remotos.
- **KJ-Nomad** — software mais recente com foco em automação de rotação, música de preenchimento entre cantores, e suporte both a coleção própria e downloads do YouTube.
- **NextUp Karaoke** — o concorrente direto mais próximo da proposta deste projeto: descrito como "o gerenciador de fila de karaokê #1", mobile-first, com pedido remoto por QR code, aprovação/reordenação/rejeição pelo host em um dashboard, e um display público de fila atualizado em tempo real. Depoimentos destacados no próprio site do produto mencionam explicitamente a experiência mobile e o recurso de QR code como diferenciais percebidos pelos usuários finais.

### 6.3 Leitura comparativa

O mercado de software de KJ (seção 6.2) já validou, na prática comercial, os elementos centrais da especificação técnica deste projeto: pedido remoto via celular, aprovação/moderação pelo host, fila pública em tela compartilhada e rotação justa de cantores. A diferenciação potencial do projeto está em (a) usar o catálogo do YouTube diretamente em vez de um catálogo licenciado próprio (menor custo de licenciamento de conteúdo, ao custo de maior exposição às restrições de cota e TOS documentadas na seção 7); (b) arquitetura mobile-first nativa desde a concepção, quando parte da concorrência (Siglos, PCDJ, KJDeluxe, kJams) é software desktop com um complemento web posterior; e (c) modelo de sala autônoma (qualquer usuário pode criar uma sala e ser host) em vez de um software vendido a um KJ profissional como produto único.

## 7. YouTube Data API e YouTube IFrame Player API — restrições técnicas documentadas

- **Cota padrão:** projetos que habilitam a YouTube Data API recebem, por padrão, uma cota combinada de 10.000 unidades/dia para a maioria dos endpoints, com um teto separado e específico de 100 chamadas de `search.list` por dia (Google for Developers, *Getting Started* e *Quota and Compliance Audits*, 2026). Cada chamada de `search.list` custa 100 unidades do pool geral, então a busca é, de longe, a operação mais cara da API em termos de cota.
- **Não há tier pago de expansão de cota** — a única via oficial para aumento é o formulário de auditoria e extensão de cota da própria YouTube, sem cronograma garantido de resposta (Blotato, 2026; SocialCrawl, 2026).
- **Uma API Key não pode ser compartilhada entre múltiplos "clientes" de API** segundo as políticas de desenvolvedor do Google — um projeto de API deve corresponder a um único cliente de API; fragmentar o uso entre múltiplos projetos do Google Cloud para multiplicar artificialmente a cota é tratado como violação de política, não uma zona cinzenta (Blotato, 2026).
- **Restrições de exibição do player embutido (IFrame Player API):** não é permitido sobrepor elementos de interface por cima do player ou de seus controles nativos; a interface do app deve ficar ao redor, nunca sobre o vídeo — isso é diretamente aplicável ao desenho da tela de projeção do karaokê (fila deve ficar em uma faixa separada da área de vídeo).
- **Confirmação relevante ao produto:** assinaturas de consumidor como o YouTube Premium não conferem nenhum benefício de cota de API — a cota é vinculada ao projeto no Google Cloud Console, não à conta/assinatura do usuário que gerou a chave (OutlierKit, 2026).

## 8. Implicações de UX/UI extraídas da literatura

- A pesquisa do Jukola (2004) reforça que a **visibilidade pública do estado da fila** (quem pediu o quê, o que está tocando, o que vem a seguir) é, por si, geradora de interação social relevante — não apenas informação funcional. Isso justifica investir em uma tela de projetor bem desenhada (seção 14 da especificação técnica) como parte central da experiência, não como um acessório secundário.
- "Hitting Pause" (2022) sugere que, em contextos de conexão social, os usuários toleram bem uma fila "imperfeita" (ordem não ideal, gostos musicais variados) desde que o processo de participação seja simples — o que reforça a recomendação de manter o fluxo de adicionar música em poucos toques, sem fricção.
- A literatura sobre conflito em jukeboxes sociais reforça que **mecanismos de moderação (aprovação manual) existem precisamente para mitigar conflito**, não para controlar qualidade musical — o que valida o toggle de aprovação de fila do projeto como uma ferramenta social, e sugere que a UI de aprovação deveria ser rápida e de baixo atrito para o host, já que o objetivo é resolver conflito potencial sem se tornar, ela própria, um gargalo.
- Estudos de watch party (StreamLayer, 2026) reforçam que a percepção de "estarmos todos no mesmo lugar da experiência" é o requisito não negociável — no caso deste projeto, isso se traduz em latência baixa e consistente entre a ação no controller (ex: aprovar/pular) e o reflexo na tela, mais do que em qualquer feature adicional.

## 9. Lacunas identificadas e oportunidades

- A pesquisa acadêmica sobre filas musicais colaborativas concentra-se majoritariamente em contextos de streaming por assinatura (Spotify) ou em protótipos de pesquisa datados (Jukola, MusicFX, ~2004-2008); há relativamente pouca literatura recente tratando especificamente da combinação **karaokê + YouTube como fonte de conteúdo + fila pública em tela compartilhada**, o que sugere que o projeto ocupa um nicho pouco documentado formalmente, mesmo já validado comercialmente pelo segmento de software de KJ (seção 6.2).
- Não foi localizada pesquisa acadêmica publicada especificamente sobre os efeitos de UX de moderação de fila em karaokê comercial (bares/restaurantes) — a literatura mais próxima trata de jukeboxes de música ambiente, não de performance vocal ao vivo, que tem uma dinâmica social diferente (o cantor está exposto, não apenas a escolha musical).
- Do lado técnico, a arquitetura "chave por host" adotada na especificação técnica não tem, até o momento desta pesquisa, um paralelo documentado publicamente em nenhum dos softwares de KJ mapeados (todos usam catálogo próprio licenciado, não a cota individual de terceiros) — é um ponto de risco e também de potencial diferenciação a ser monitorado conforme o projeto evolui.

## 10. Referências Bibliográficas

**Karaokê — história e cultura**
- OPEN CULTURE. *Meet the Inventor of Karaoke, Daisuke Inoue, Who Wanted to "Teach the World to Sing"*. 2021/2025. Disponível em: openculture.com.
- WIKIPEDIA. *Daisuke Inoue*. 2026. Disponível em: en.wikipedia.org/wiki/Daisuke_Inoue.
- MISSED HISTORY. *Daisuke Inoue's Karaoke Machine: The Modest Music Box That Launched a Party Industry*. 2025. Disponível em: missedhistory.com.
- GROKIPEDIA. *Daisuke Inoue*. 2026. Disponível em: grokipedia.com/page/Daisuke_Inoue.
- MYKARAOKE.VIDEO. *Where Did Karaoke Originate: A Cultural History*. 2025. Disponível em: mykaraoke.video.

**Watch party e reprodução sincronizada**
- CHEN, J.; LIAO, J. *Antecedents of Viewers' Live Streaming Watching: A Perspective of Social Presence Theory*. Frontiers in Psychology, 2022. DOI: 10.3389/fpsyg.2022.839629.
- LU, Z. et al. *You Watch, You Give, and You Engage: A Study of Live Streaming Practices in China*. arXiv:1803.06032.
- USPTO. *Synchronizing streams of co-watching digital video content while providing live digital video chat streams across multiple client devices*. Patente US 11,206,443 B1.
- VARIETY. *'Watch Party' Trend Sweeping the Video World Amid Lockdown*. 2020.
- VIACCESS-ORCA. *Becoming social: how watch parties have flourished during the pandemic*. 2022.
- STREAMLAYER. *Social Viewing & Watch Parties — 42% of Fans Watch Together*. 2026.
- ENTERTAINMENT POST. *What is a Watch Party?: Everything You Need to Know About Synchronized Streaming*. 2025.

**Filas colaborativas e escolha musical em grupo (HCI)**
- O'HARA, K.; LIPSON, M.; JANSEN, M.; UNGER, A.; JEFFRIES, H.; MACER, P. *Jukola: Democratic Music Choice in a Public Space*. In: Proceedings of DIS '04. ACM, 2004, p. 145–154. DOI: 10.1145/1013115.1013136.
- MCCARTHY, J. F.; ANAGNOST, T. D. *MusicFX: An Arbiter of Group Preferences for Computer Supported Collaborative Workouts*. In: Proceedings of CSCW '98. ACM, 1998, p. 363–372.
- SPRAGUE, D. W.; WU, F.; TORY, M. *PartyVote: A Democratic Music Jukebox*. (via Semantic Scholar).
- BASSOLI, A.; MOORE, J.; AGAMANOLIS, S. *Social Playlist: Enabling Touch Points and Enriching Ongoing Relationships through Collaborative Mobile Music Listening*. In: Proceedings of MobileHCI '08. ACM, 2008. DOI: 10.1145/1409240.1409299.
- PINDER, S.; ODOM, W.; YOO, M.; MISRA, A.; LIN, H.; NEUSTAEDTER, C.; BARNETT, S. *Queue Player: Investigating Distributed Co-Listening Experiences for Social Connection across Space, Time, and Tempo*. In: Proceedings of CHI 2025. ACM. DOI: 10.1145/3706598.3714293.
- (ISMIR 2019). *Tunes Together: Perception and Experience of Collaborative Playlists*. Disponível em: archives.ismir.net.
- *Social Music Curation That Works: Insights from Successful Collaborative Playlists*. Proceedings of the ACM on Human-Computer Interaction, v. 5, CSCW1, 2021. DOI: 10.1145/3449191.
- *Hitting Pause: How User Perceptions of Collaborative Playlists Evolved in the United States During the COVID-19 Pandemic*. CHI 2022. DOI: 10.1145/3491102.3517604.
- KWAK, D.; PARK, S.; CHA, I.; KIM, H.; LIM, Y. *Investigating the Potential of Group Recommendation Systems As a Medium of Social Interactions: A Case of Spotify Blend Experiences between Two Users*. CHI 2024. DOI: 10.1145/3613904.3642544.
- GABBOLINI, G.; BRIDGE, D. *Surveying More Than Two Decades of Music Information Retrieval Research on Playlists*. ACM Transactions on Intelligent Systems and Technology, v. 15, n. 6, 2024. DOI: 10.1145/3688398.

**YouTube Data API e políticas técnicas**
- GOOGLE FOR DEVELOPERS. *YouTube Data API — Overview / Getting Started*. developers.google.com/youtube/v3/getting-started.
- GOOGLE FOR DEVELOPERS. *Quota and Compliance Audits — YouTube Data API*. developers.google.com/youtube/v3/guides/quota_and_compliance_audits.
- BLOTATO. *YouTube API Pricing: Complete Guide for 2026*. blotato.com/blog/youtube-api-pricing.
- SOCIALCRAWL. *YouTube API Quota: 100 Searches Burn 10,000 Units (2026)*. socialcrawl.dev/blog/youtube-data-api-2026.
- OUTLIERKIT. *YouTube API Pricing in 2026: Is It Free? What It Actually Costs*. outlierkit.com/resources/youtube-api-pricing.

**Mapeamento de mercado — apps de karaokê e software de KJ**
- ZEGOCLOUD. *The Best Online Karaoke App for Party and Practice in 2026*. zegocloud.com/blog/karaoke-app.
- SINGA. *16 Best Karaoke Apps*. singa.com/blog/best-karaoke-apps.
- MUSIC INDUSTRY HOW TO. *13 Best Karaoke Apps 2026*. musicindustryhowto.com/karaoke-apps.
- SINGWELL. *Best Karaoke Apps 2026: A Voice Teacher's Top Picks*. singwell.eu/karaoke-apps.
- UNSTAR. *Smule vs StarMaker vs Yokee: Karaoke Apps (2026)*. unstar.app/blog/smule-starmaker-yokee-wesing-singa-karaoke-apps-ranked-2026.
- BLOOM VOCAL. *Best Singing Apps for Live Performance 2026*. bloomvocal.site.
- WIFITALENTS. *Karaoke Software | Ranked for 2026*. wifitalents.com/best/karaoke-software.
- POWERKARAOKE. *Siglos Karaoke Professional — KJ Hosting Software for PC*. powerkaraoke.com.
- PCDJ. *Karaoke System For A Bar | The Software Essentials*. pcdj.com/karaoke-system-for-a-bar.
- MYKARAOKE.VIDEO. *Top 7 Karaoke Software for Bars to Boost Your Nights* e *12 Karaoke Software Best Options for 2025*. mykaraoke.video/blog.
- SINGA. *Why Singa is an amazing karaoke tool for karaoke bars with KJs*. singa.com/blog.
- NEXTUP KARAOKE. *NextUp Karaoke — The #1 Karaoke Queue Manager*. nextupkaraoke.com.
- LIGHTYEAR MUSIC. *Karaoke Software Windows | KJ Deluxe*. lightyearmusic.com.
- KJAMS. *kJams Karaoke Software*. karaoke.kjams.com.
- NOMAD KARAOKE. *KJ-Nomad — Professional Karaoke Software*. kj.nomadkaraoke.com.

**Nota metodológica:** as referências de mercado (apps e softwares) foram coletadas via busca na web em setembro de 2026 e refletem o estado do mercado nessa data; preços, catálogos e posicionamento de produto mudam com frequência e devem ser reverificados antes de decisões de negócio. As referências acadêmicas foram localizadas via busca na web (Google Scholar/ACM Digital Library/Semantic Scholar/arXiv, indiretamente) e recomenda-se validação do texto completo de cada artigo antes de citação formal em um trabalho acadêmico stricto sensu.
