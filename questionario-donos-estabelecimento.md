# Questionário de Validação — Donos de Bares, Restaurantes e Casas de Show

Pesquisa de campo do **Karaokê Watch Party** (app mobile-first de fila de karaokê com pedido por QR code, fila compartilhada e tela em tempo real na casa).

**Público:** donos/gerentes de bares, restaurantes e casas de show (atuais ou potenciais usuários do papel "host" do produto).

**Objetivos simultâneos desta pesquisa:**
1. **Viabilidade financeira** — estimar potencial de lucro/monetização do produto (demanda, ticket, volume, disposição a pagar, comissão sobre bebidas).
2. **Aperfeiçoamento de produto** — priorizar funcionalidades do app e da futura rede social (fila, moderação, tela, fidelização, badges e integração com redes sociais).

**Como aplicar:** o formulário pode ser aplicado em campo (entrevista) ou convertido em formulário digital (Google Forms/Typeform). Tempo estimado: **8–12 minutos**.

**Registro de dados:** as respostas alimentam a qualificação comercial e a priorização do roadmap (ver `karaoke-watch-party-spec.md` §§16–17). O respondente deve consentir com o uso dos dados antes da aplicação (LGPD — política de retenção e exclusão prevista na spec §13).

---

> **Dica de aplicação (fora das 15 perguntas):** registre também, para classificação da amostra e segmentação da análise financeira, o tipo de estabelecimento (bar/restaurante/casa de show), a cidade e o porte aproximado (nº de mesas ou de funcionários).

---

## Perguntas

### 1. Quantas noites de karaokê sua casa realiza por mês?
- **Tipo:** numérica
- **Meta:** financeira — mede a recorrência de demanda; base para estimar frequência de uso e potencial de receita do app.

### 2. Como a fila de cantores é organizada hoje? (marque todas que se aplicam)
Opções: caderno/papel · planilha manual · app/QR code próprio · software específico de karaokê (KJ) · não há fila organizada · outro (descreva)
- **Tipo:** múltipla escolha (com "outro" aberto)
- **Meta:** produto — identifica a dor atual e o ponto de partida da migração; prioriza a fila como funcionalidade central (impacto financeiro indireto: quanto se investe hoje em ferramenta).

### 3. Em uma noite de karaokê, quantas pessoas estão, em média, na casa ao mesmo tempo?
- **Tipo:** numérica
- **Meta:** financeira — dimensiona o público simultâneo por noite (volume de cantores/participantes) e o potencial de venda.

### 4. Qual é o ticket médio por cliente em uma noite de karaokê (em R$)?
- **Tipo:** numérica
- **Meta:** financeira — estima a receita por noite e subsidia a análise de comissão sobre bebidas.

### 5. Quanto sua casa gasta hoje, por mês, com estrutura de karaokê (software de KJ, licenças, equipamentos, contratação de DJ/cantores)?
- **Tipo:** numérica
- **Meta:** financeira — compara o custo atual com o preço de uma assinatura e dimensiona a disposição real a pagar.

### 6. Em uma escala de 1 a 5, o quanto você estaria disposto a pagar uma assinatura mensal por um app que gerencia a fila pelo celular e a exibe em tempo real na tela da casa (TV/projetor)?
(1 = nenhuma disposição · 5 = disposição alta)
- **Tipo:** escala 1–5
- **Meta:** financeira — mensura a vontade de pagar por assinatura/plano.

### 7. Dentro de qual faixa de preço mensal você consideraria pagar por essa assinatura?
Opções: nada · até R$ 100 · R$ 101–300 · R$ 301–700 · mais de R$ 700
- **Tipo:** múltipla escolha
- **Meta:** financeira — define a faixa de preço viável do plano premium do MVP.

### 8. Considerando que o app tende a fazer as pessoas ficarem mais tempo (e consumirem mais), você aceitaria um modelo de comissão sobre as bebidas vendidas nas noites de karaokê?
Opções: sim, sem problema · sim, desde que a taxa seja baixa/negociável · talvez · prefiro assinatura fixa · não aceitaria
- **Tipo:** múltipla escolha
- **Meta:** financeira — valida a alternativa de monetização por comissão sobre bebida.

### 9. Que porcentagem do faturamento mensal da sua casa vem das noites de karaokê?
- **Tipo:** numérica (%)
- **Meta:** financeira — pondera o peso do karaokê na receita e o impacto esperado de melhoria da experiência.

### 10. Numa escala de 1 a 5, o quanto o karaokê é, hoje, um atrativo lucrativo para sua casa?
(1 = não é rentável/indiferente · 5 = forte gerador de receita e público)
- **Tipo:** escala 1–5
- **Meta:** ambas — quantifica a percepção de valor atual (norteia precificação) e serve de dado de produto sobre o posicionamento do karaokê.

### 11. Sobre as músicas pedidas pelos clientes, qual modelo você prefere?
Opções: as músicas entram direto na fila assim que o cliente pede (sem aprovação) · as músicas ficam "pendentes" até você/aprovador autorizar · depende do dia ou do público
- **Tipo:** múltipla escolha
- **Meta:** produto — valida o toggle `queueApprovalMode` (auto/manual) e o painel de aprovação do host.

### 12. Numa escala de 1 a 5, o quanto é importante a fila aparecer em tempo real na tela da casa (próximo cantor visível para todos)?
(1 = irrelevante · 5 = essencial para a experiência)
- **Tipo:** escala 1–5
- **Meta:** produto — valida a tela do player/kiosk e o destaque para o próximo da fila (spec §14).

### 13. Numa escala de 1 a 5, qual seu interesse em integrar as redes sociais do seu estabelecimento ao app (divulgar noites de karaokê, promoções e atrações)?
(1 = nenhum · 5 = muito interessado)
- **Tipo:** escala 1–5
- **Meta:** produto — valida a futura camada de integração social dos donos (spec §16 — OAuth de Instagram/Facebook/WhatsApp/X).

### 14. Numa escala de 1 a 5, qual seu interesse em oferecer fidelização via "selo" da sua casa — clientes frequentes ganham um badge/conquista com a identidade do seu estabelecimento no perfil deles?
(1 = nenhum · 5 = muito interessado)
- **Tipo:** escala 1–5
- **Meta:** produto — valida o "selo de presença"/badge do bar na futura rede social (spec §17) e o efeito de retenção de clientes.

### 15. Quantos cantores únicos participam, em média, de uma noite de karaokê?
- **Tipo:** numérica
- **Meta:** produto (com reflexo financeiro) — mede a rotatividade de participantes por noite; orienta a rotação justa da fila e estima a comunidade ativa para a rede social.

---

## Como usar os resultados

- **Financeiro:** agrupar respostas 1, 3–10 por segmento (tipo de casa/cidade/porte) para projetar receita (assinatura + comissão) e definir preço/plano.
- **Produto:** respostas 2, 11–15 alimentam a priorização de funcionalidades do MVP (fila/moderação/tela) e da visão pós-MVP (integração social dos donos e rede social dos cantores — spec §§16–17).
- Registrar os dados do questionário e da coleta OAuth dos donos (spec §16) como insumo de qualificação de leads comerciais.