-- Tirar da fila o próprio pedido (correção de 2026-09-27).
--
-- O botão "Tirar da fila" já era renderizado para o participante que tinha
-- pedido a música, mas o DELETE era host-only (`queue_items_delete_host`): a
-- action devolvia "Só o dono da sala pode remover músicas" toda vez. Botão que
-- nunca funciona é pior que botão nenhum — e era o único caminho do
-- participante para um pedido errado.
--
-- O alcance é estreito de propósito:
--  - só o AUTOR do pedido (`added_by_user_id = auth.uid()`), nunca o pedido de
--    outra pessoa;
--  - só enquanto não está tocando (`pending`/`approved`): música em reprodução
--    se resolve com "Pular", do host;
--  - `with check` não se aplica a DELETE, mas o gatilho de posisi continua
--    funcionando igual para os dois (a fila não fica com buraco de posição).
--
-- A regra pura que espelha isto está em `buildQueueRemoval` (src/lib/rooms/queue.ts)
-- e o teste de fumaça do banco continua sendo `npm run diagnose:queue`.

drop policy if exists "queue_items_delete_own" on public.queue_items;
create policy "queue_items_delete_own"
  on public.queue_items
  for delete
  to authenticated
  using (
    added_by_user_id = auth.uid()
    and status in ('pending'::public.queue_item_status, 'approved'::public.queue_item_status)
  );

-- ── 2ª parte: por que o DELETE nunca chegava no celular do participante ───────
-- A `QueueList` escuta `postgres_changes` COM filtro `room_id=eq.<id>`. Para
-- INSERT/UPDATE o Realtime usa a linha nova e o filtro funciona; para DELETE ele
-- precisa da linha ANTIGA, que só vem com `REPLICA IDENTITY FULL` — sem isso o
-- evento sai sem `old_record`, o filtro não casa e a remoção do host/Pedido
-- simplesmente não chega em lugar nenhum (sem erro visível). Aprovar era
-- UPDATE e por isso às vezes funcionava; tirar da fila era DELETE e por isso
-- "nunca atualizava". A tabela é pequena e o custo é de WAL, então vale a
-- garantia de que todo evento da fila é filtrável.
alter table public.queue_items replica identity full;
