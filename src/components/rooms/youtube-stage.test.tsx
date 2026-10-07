import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";

import {
  YT_ERROR_API_TIMEOUT,
  YT_ERROR_AUTOPLAY_BLOCKED,
  YT_STATE,
  YouTubeStage,
  type YouTubeStageHandle,
} from "./youtube-stage";
import {
  installFakeYouTube,
  uninstallFakeYouTube,
  type FakeYouTube,
} from "@/test/fake-youtube";

/**
 * O contrato do player, testado contra a API real (e não contra um duplo
 * permissivo): a instância do construtor **não tem métodos** até o iframe
 * mandar `onReady`. O duplo faithful está em `src/test/fake-youtube.ts`.
 *
 * Regressão que motivou esta suíte: a versão anterior chamava `onReady` logo
 * após `new YT.Player`, o quiosque aplicava `load()` e a TV morria com
 * `player.loadVideoById is not a function`.
 */
describe("YouTubeStage — ciclo de vida real da IFrame API", () => {
  let yt: FakeYouTube;

  beforeEach(() => {
    yt = installFakeYouTube();
  });

  afterEach(() => {
    cleanup();
    uninstallFakeYouTube();
  });

  function mount(props: Partial<React.ComponentProps<typeof YouTubeStage>> = {}) {
    const ref = createRef<YouTubeStageHandle>();
    const onReady = props.onReady ?? vi.fn();
    const onError = props.onError ?? vi.fn();
    const utils = render(
      <YouTubeStage ref={ref} onReady={onReady} onError={onError} {...props} />
    );
    return { ref, onReady, onError, ...utils };
  }

  /** Deixa a promise da API resolver (o `new YT.Player` acontece aqui). */
  async function mountPlayer(props?: Partial<React.ComponentProps<typeof YouTubeStage>>) {
    const mounted = mount(props);
    await act(async () => {
      await Promise.resolve();
    });
    expect(yt.options).not.toBeNull();
    return mounted;
  }

  it("a instância do construtor não tem métodos — igual à API real", () => {
    expect(yt.isPlayable()).toBe(false);
  });

  it("não avisa que está pronto nem chama método antes do onReady do iframe", async () => {
    const { ref, onReady } = await mountPlayer();

    // Este é o crash real: o quiosque chamava load() aqui e levava TypeError.
    expect(() => ref.current?.load("abc123", 0)).not.toThrow();
    expect(() => ref.current?.play()).not.toThrow();

    expect(onReady).not.toHaveBeenCalled();
    expect(yt.player.loadVideoById).not.toHaveBeenCalled();
    expect(yt.player.playVideo).not.toHaveBeenCalled();
  });

  it("aplica o comando que chegou antes do ready, assim que o iframe fica pronto", async () => {
    const { ref, onReady } = await mountPlayer();

    ref.current?.load("abc123", 0);
    ref.current?.play();

    act(() => yt.ready());

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    expect(yt.player.playVideo).toHaveBeenCalled();
  });

  it("usa o player entregue no evento (event.target), que é o handle documentado", async () => {
    const { ref } = await mountPlayer();
    let readyTarget: unknown = null;

    ref.current?.load("abc123", 0);
    act(() => {
      yt.ready();
      readyTarget = yt.instance;
    });

    // O evento entrega a mesma instância que ganhou os métodos: se o
    // componente usasse o objeto do construtor antes do ready, quebraria.
    expect(yt.isPlayable()).toBe(true);
    expect(readyTarget).toBe(yt.instance);
    expect(yt.instance.loadVideoById).toHaveBeenCalledWith("abc123", 0);
  });

  it("pausar e parar chegam ao player, e parar limpa a faixa pendente", async () => {
    const { ref } = await mountPlayer();
    act(() => yt.ready());

    ref.current?.load("abc123", 0);
    ref.current?.pause();
    ref.current?.stop();

    expect(yt.player.pauseVideo).toHaveBeenCalled();
    expect(yt.player.stopVideo).toHaveBeenCalled();
  });

  it("o estado pausado chega ao player mesmo quando o comando veio antes do ready", async () => {
    const { ref } = await mountPlayer();

    ref.current?.load("abc123", 0);
    ref.current?.pause();
    act(() => yt.ready());

    expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    expect(yt.player.pauseVideo).toHaveBeenCalled();
    expect(yt.player.playVideo).not.toHaveBeenCalled();
  });

  it("guarda só o último comando de cada tipo, sem recarregar a mesma faixa", async () => {
    const { ref } = await mountPlayer();

    // A TV recebeu duas relêções antes de o player ficar pronto: a última
    // intenção é a que vale (música nova), senão a fila tocaria a música velha.
    ref.current?.load("velha", 0);
    ref.current?.load("nova", 0);
    ref.current?.play();
    act(() => yt.ready());

    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(yt.player.loadVideoById).toHaveBeenCalledWith("nova", 0);

    // E reaplicar o mesmo estado não recarrega (recarregar=zera o vídeo).
    ref.current?.load("nova", 0);
    ref.current?.play();
    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);
  });

  it("repassa o id da faixa que terminou, para o quiosque pedir a próxima", async () => {
    const onEnded = vi.fn();
    const { ref } = await mountPlayer({ onEnded });

    ref.current?.load("abc123", 0);
    act(() => yt.ready());
    act(() => yt.stateChange(YT_STATE.ENDED));

    expect(onEnded).toHaveBeenCalledWith("abc123");
  });

  it("erro 150 vira pedido de gesto; os outros viram erro visível", async () => {
    const onBlocked = vi.fn();
    const { onError } = await mountPlayer({ onBlocked });

    act(() => yt.ready());
    act(() => yt.error(YT_ERROR_AUTOPLAY_BLOCKED));
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    act(() => yt.error(101));
    expect(onError).toHaveBeenCalledWith(101);
  });

  it("avisa quando o player não fica pronto — nada de tela preta silenciosa", async () => {
    vi.useFakeTimers();
    try {
      const { onError } = await mountPlayer();
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(onError).toHaveBeenCalledWith(YT_ERROR_API_TIMEOUT);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não executa o que ficou pendente se o stage desmontar antes do ready", async () => {
    const { ref, unmount } = await mountPlayer();

    ref.current?.load("abc123", 0);
    unmount();
    act(() => yt.ready());

    expect(yt.player.loadVideoById).not.toHaveBeenCalled();
  });

  it("destrói o player no unmount depois de pronto", async () => {
    const { ref, unmount } = await mountPlayer();
    act(() => yt.ready());
    ref.current?.load("abc123", 0);

    unmount();

    expect(yt.player.destroy).toHaveBeenCalledTimes(1);
  });

  it("destrói o player com o stage AINDA no DOM, e sobrevive a um destroy que lança", async () => {
    // Regressão do crash de 2026-09-27 (2º incidente, mesma causa-raiz): a IFrame
    // API destrói o player removendo o iframe do pai. Com o cleanup no
    // `useEffect` (fase passiva), o React já tinha removido o DOM e o
    // `removeChild` era sobre um nó órfão → `NotFoundError` → tela de erro na
    // TV. Acontecia quando a fila esvaziava e quando o host apertava "Parar".
    const { ref, unmount } = await mountPlayer();
    act(() => yt.ready());
    ref.current?.load("abc123", 0);

    let stageInDomAtDestroy = false;
    yt.player.destroy.mockImplementation(() => {
      stageInDomAtDestroy = Boolean(
        document.querySelector('[data-testid="youtube-stage"]')
      );
      throw new DOMException(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        "NotFoundError"
      );
    });

    expect(() => unmount()).not.toThrow();

    // A ordem é o que corrige: no momento do destroy o stage ainda estava no
    // documento (cleanup de layout, não de efeito passivo).
    expect(stageInDomAtDestroy).toBe(true);
    expect(yt.player.destroy).toHaveBeenCalledTimes(1);
  });

  it("desmontar antes de o player ficar pronto não estoura (destroy não existe)", async () => {
    // A versão anterior chamava `destroy()` na instância parcial: o mesmo
    // TypeError do load, agora no cleanup — derrubava a tela ao trocar de faixa.
    const { unmount } = await mountPlayer();

    expect(() => unmount()).not.toThrow();
  });
});

/**
 * O CTA de "toque para começar" (o pedido de gesto por autoplay). Regressão do
 * teste manual na TV: o quiosque relê o estado a cada 5s (poll) e reaplica
 * leitura, porque o objeto `current` volta novo do banco. Com o pedido de
 * gesto armada em todo `play()`, o CTA reaparecia sem parar por cima de um
 * vídeo que já estava tocando.
 */
describe("YouTubeStage — o CTA de gesto não vira spam", () => {
  let yt: FakeYouTube;

  beforeEach(() => {
    yt = installFakeYouTube();
  });

  afterEach(() => {
    cleanup();
    uninstallFakeYouTube();
  });

  async function mount(props: Partial<React.ComponentProps<typeof YouTubeStage>> = {}) {
    const ref = createRef<YouTubeStageHandle>();
    const onBlocked = vi.fn();
    const onPlaying = vi.fn();
    const utils = render(
      <YouTubeStage ref={ref} {...props} onBlocked={onBlocked} onPlaying={onPlaying} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    return { ref, onBlocked, onPlaying, ...utils };
  }

  it("play() do poll não pede gesto nenhum", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked, onPlaying } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => yt.stateChange(YT_STATE.PLAYING));
      expect(onPlaying).toHaveBeenCalledTimes(1);

      // Três relêções de estado (poll de 5s) = três `play()` sem gesto.
      for (let i = 0; i < 3; i += 1) {
        act(() => ref.current?.play());
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
      }

      expect(onBlocked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("faixa carregada que não começa (CUED) pede o gesto uma vez", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => yt.stateChange(YT_STATE.CUED));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(onBlocked).toHaveBeenCalledTimes(1);

      // O probe é de janela, não de repetição: não vira loop.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onBlocked).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("PLAYING cancela o pedido pendente e some com o CTA", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked, onPlaying } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => yt.stateChange(YT_STATE.CUED));
      act(() => yt.stateChange(YT_STATE.PLAYING));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(onPlaying).toHaveBeenCalledTimes(1);
      expect(onBlocked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("buffering depois de começar a tocar não pede gesto (é reconexão de rede)", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => yt.stateChange(YT_STATE.PLAYING));
      act(() => yt.stateChange(YT_STATE.BUFFERING));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(onBlocked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("o clique do CTA é o único play() que rearma o pedido", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => yt.stateChange(YT_STATE.CUED));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(onBlocked).toHaveBeenCalledTimes(1);

      act(() => ref.current?.play({ userGesture: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(onBlocked).toHaveBeenCalledTimes(2);

      // Tocou: o pedido para de vez.
      act(() => yt.stateChange(YT_STATE.PLAYING));
      act(() => ref.current?.play({ userGesture: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onBlocked).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pausar e a fila vazia cancelam o pedido de gesto", async () => {
    vi.useFakeTimers();
    try {
      const { ref, onBlocked } = await mount();
      act(() => yt.ready());
      ref.current?.load("abc123", 0);
      act(() => ref.current?.pause());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onBlocked).not.toHaveBeenCalled();

      // Fila vazia: stop() limpa tudo, inclusive um CTA pendente.
      ref.current?.load("abc123", 0);
      act(() => ref.current?.stop());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onBlocked).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * O contrato das opções do player — a lista **fechada** do que a TV depende.
 *
 * Por que uma lista fechada e não "tem `controls`": até 2026-10-05 a única
 * asserção do repo inteiro sobre opções era `expect(yt.options).not.toBeNull()`,
 * que só prova que o construtor rodou. Apagar `controls: 1` — a barra de
 * controles que o host usa para-volume e fullscreen — deixava a suíte **verde**,
 * e a TV perdia a barra sem nenhum sinal. É a mesma classe de falha do §3.7 do
 * pós-mortem: a tela verde que não cobre o que quebrou.
 *
 * `cc_load_policy: 0` entra na lista pelo mesmo motivo e pelo motivo do dono
 * (2026-10-05): legenda do YouTube é transcrição por IA, não é letra, e
 * atrapalha o karaokê. O estado certo era alcançado por omissão — se alguém
 * acrescentar um parâmetro para "melhorar", ninguém tem como saber que quebrou
 * a decisão.
 */
describe("YouTubeStage — contrato das opções do player", () => {
  let yt: FakeYouTube;

  beforeEach(() => {
    yt = installFakeYouTube();
  });

  afterEach(() => {
    cleanup();
    uninstallFakeYouTube();
  });

  it("monta o player com exatamente as opções que a TV precisa", async () => {
    render(<YouTubeStage />);
    await act(async () => {
      await Promise.resolve();
    });

    // Lista fechada de propósito: chaves a mais ou a menos são erro, não
    // detalhe. Se aparecer uma nova, a decisão passa por este teste.
    expect(yt.options?.playerVars).toEqual({
      // Quem manda no play é o `PlayerGate`, não o player.
      autoplay: 0,
      controls: 1,
      rel: 0,
      fs: 0,
      playsinline: 1,
      iv_load_policy: 3,
      // Legenda (IA do YouTube) desligada por decisão do dono.
      cc_load_policy: 0,
      // Sem `origin` a IFrame API não faz postMessage: o quiosque perde o
      // controle do player inteiro.
      origin: window.location.origin,
    });
  });

  it("não pede a lista de faixas de legenda ao YouTube", async () => {
    render(<YouTubeStage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(yt.options?.playerVars?.cc_load_policy).toBe(0);
  });
});
