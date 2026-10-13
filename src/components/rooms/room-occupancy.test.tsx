import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const state: {
    payload: unknown;
    error: { message: string } | null;
    realtime?: () => void;
    memberRoomId?: string;
    unsubscribed?: boolean;
  } = {
    payload: {},
    error: null,
    realtime: undefined,
    memberRoomId: undefined,
    unsubscribed: undefined,
  };

  const rpc = vi.fn(async () => ({ data: state.payload, error: state.error }));

  // O card não abre mais canal de `postgres_changes`: assina o broadcast da
  // sala (`room-members:<roomId>`) e relê pela RPC. Aqui só o `rpc` importa.
  const supabase = { rpc };

  const subscribeToMemberChanges = vi.fn(
    (roomId: string, onChange: () => void, onStatus?: (status: string) => void) => {
      state.memberRoomId = roomId;
      state.realtime = onChange;
      // O canal real avisa `SUBSCRIBED` quando sobe — e é esse callback que
      // dispara a primeira leitura (o `carregar()` saiu do corpo do efeito para
      // não violar `react-hooks/set-state-in-effect`).
      onStatus?.("SUBSCRIBED");
      return () => {
        state.unsubscribed = true;
      };
    }
  );

  return { state, rpc, supabase, subscribeToMemberChanges };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/rooms/member-channel", () => ({
  subscribeToMemberChanges: (
    roomId: string,
    onChange: () => void,
    onStatus?: (status: string) => void
  ) => mocks.subscribeToMemberChanges(roomId, onChange, onStatus),
  announceMembersChange: vi.fn(async () => {}),
}));

import { RoomOccupancyCard } from "./room-occupancy";

const base = { roomId: "room-1", quantidadeMesas: 3 };

const cheio = {
  total: 5,
  dentro: 4,
  fora: 1,
  sem_mesa: 1,
  pendentes: 2,
  por_mesa: { "1": 2, "2": 1 },
};

function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

/** O número fica logo antes do rótulo dentro do mesmo quadradinho. */
function numeroDe(rotulo: string): string {
  const elemento = screen.getByText(rotulo);
  return (elemento.previousElementSibling?.textContent ?? "").trim();
}

describe("RoomOccupancyCard", () => {
  beforeEach(() => {
    mocks.state.payload = {};
    mocks.state.error = null;
    mocks.state.realtime = undefined;
    mocks.state.memberRoomId = undefined;
    mocks.state.unsubscribed = undefined;
    mocks.rpc.mockClear();
    mocks.subscribeToMemberChanges.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * A regra de 2026-10-02 ("quem está fora do raio entra e só assiste") é
   * invisível para o dono da sala sem isto: "ninguém entrou" e "entraram, mas
   * estão longe" são a mesma tela vazia.
   */
  it("separa quem está dentro do raio de quem entrou de fora", async () => {
    mocks.state.payload = cheio;
    const { container } = render(<RoomOccupancyCard {...base} />);

    await waitFor(() => expect(screen.getByText("Quem está na sala")).toBeInTheDocument());
    const texto = textOf(container);
    expect(texto).toMatch(/5 pessoas na sala/);
    expect(screen.getByText("na sala")).toBeInTheDocument();
    expect(screen.getByText("dentro do raio")).toBeInTheDocument();
    expect(screen.getByText("fora do raio")).toBeInTheDocument();
    // 5 na sala · 4 dentro · 1 fora
    expect(numeroDe("na sala")).toBe("5");
    expect(numeroDe("dentro do raio")).toBe("4");
    expect(numeroDe("fora do raio")).toBe("1");
    expect(texto).toMatch(/assiste à playlist, mas não escolhe mesa nem pede música/);
  });

  it("mostra os pendentes junto com a contagem", async () => {
    mocks.state.payload = cheio;
    render(<RoomOccupancyCard {...base} />);

    await waitFor(() =>
      expect(screen.getByText(/2 aguardando sua aprovação/)).toBeInTheDocument()
    );
  });

  /**
   * Mesa vazia é informação: o host precisa ver a 3 que ninguém escolheu, e
   * não só as que têm gente.
   */
  it("desenha todas as mesas do bar, mesmo as vazias", async () => {
    mocks.state.payload = cheio;
    render(<RoomOccupancyCard {...base} />);

    await waitFor(() => expect(screen.getByText("Mesa 1")).toBeInTheDocument());
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();
    expect(screen.getByText("Mesa 3")).toBeInTheDocument();
  });

  it("conta ao vivo: reconsulta quando o Realtime avisa que algo mudou", async () => {
    mocks.state.payload = {
      ...cheio,
      total: 1,
      dentro: 1,
      fora: 0,
      pendentes: 0,
      por_mesa: {},
    };
    const { container } = render(<RoomOccupancyCard {...base} />);
    await waitFor(() => expect(textOf(container)).toMatch(/1 pessoa na sala/));

    mocks.state.payload = cheio;
    await waitFor(() => expect(mocks.state.realtime).toBeDefined());
    mocks.state.realtime?.();

    // Uma ida só no banco no mount: a segunda vem do evento.
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_room_occupancy", { p_room_id: "room-1" });
    await waitFor(() => expect(textOf(container)).toMatch(/5 pessoas na sala/));
  });

  it("assina o canal broadcast da sala e desliga ao sair", async () => {
    const { unmount } = render(<RoomOccupancyCard {...base} />);
    await waitFor(() =>
      expect(mocks.subscribeToMemberChanges).toHaveBeenCalledWith(
        "room-1",
        expect.any(Function),
        expect.any(Function)
      )
    );

    unmount();
    expect(mocks.state.unsubscribed).toBe(true);
  });

  it("reconsulta pelo poll de 10s quando o realtime não avisa", async () => {
    vi.useFakeTimers();
    try {
      render(<RoomOccupancyCard {...base} />);
      // A primeira leitura vem no `SUBSCRIBED`; com fake timers ela resolve no
      // próximo flush de microtasks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const inicial = mocks.rpc.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mocks.rpc.mock.calls.length).toBeGreaterThan(inicial);
    } finally {
      vi.useRealTimers();
    }
  });

  it("mostra zero em vez de quebrar quando a RPC volta vazia", async () => {
    mocks.state.payload = null;
    render(<RoomOccupancyCard {...base} />);

    await waitFor(() =>
      expect(screen.getByText(/Ninguém entrou ainda/)).toBeInTheDocument()
    );
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("avisa quando a RPC falha, sem virar card quebrado", async () => {
    mocks.state.error = { message: "sem permissão" };
    render(<RoomOccupancyCard {...base} />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/sem permissão/)
    );
  });
});
