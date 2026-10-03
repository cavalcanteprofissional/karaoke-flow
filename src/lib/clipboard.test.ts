import { afterEach, describe, expect, it, vi } from "vitest";

import { copiarTexto } from "@/lib/clipboard";

/**
 * O caso que motivou o helper: em `http://192.168.100.28:3000` o
 * `navigator.clipboard` é `undefined` — não é uma promessa rejeitada, é a
 * propriedade que não existe. Os componentes mockavam `writeText`, então esse
 * cenário nunca entrou no teste deles.
 */
function semClipboardApi() {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function comClipboardApi(writeText: (texto: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

/** jsdom não implementa `execCommand`; o stub registra o que seria copiado. */
function comExecCommand(resultado: boolean | (() => boolean)) {
  const copia: string[] = [];
  const exec = vi.fn(() => {
    const area = document.querySelector("textarea");
    if (area) copia.push(area.value);
    return typeof resultado === "function" ? resultado() : resultado;
  });
  Object.defineProperty(document, "execCommand", {
    value: exec,
    configurable: true,
    writable: true,
  });
  return { copia, exec };
}

afterEach(() => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document, "execCommand", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  document.body.innerHTML = "";
});

describe("copiarTexto", () => {
  it("usa a Clipboard API quando ela existe", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    comClipboardApi(writeText);
    const { exec } = comExecCommand(true);

    await expect(copiarTexto("BR Code")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("BR Code");
    expect(exec).not.toHaveBeenCalled();
  });

  it("cai para o execCommand quando não há Clipboard API (HTTP da rede local)", async () => {
    semClipboardApi();
    const { copia } = comExecCommand(true);

    await expect(copiarTexto("BR Code")).resolves.toBe(true);

    expect(copia).toEqual(["BR Code"]);
  });

  it("cai para o execCommand quando a Clipboard API é rejeitada (permissão negada)", async () => {
    comClipboardApi(vi.fn().mockRejectedValue(new Error("denied")));
    const { copia } = comExecCommand(true);

    await expect(copiarTexto("BR Code")).resolves.toBe(true);

    expect(copia).toEqual(["BR Code"]);
  });

  it("reporta falha quando nenhum dos dois caminhos copia", async () => {
    semClipboardApi();
    comExecCommand(false);

    await expect(copiarTexto("BR Code")).resolves.toBe(false);
  });

  it("reporta falha quando o execCommand lança", async () => {
    semClipboardApi();
    Object.defineProperty(document, "execCommand", {
      value: () => {
        throw new Error("sem suporte");
      },
      configurable: true,
      writable: true,
    });

    await expect(copiarTexto("BR Code")).resolves.toBe(false);
  });

  it("não deixa o textarea temporário no documento e devolve o foco", async () => {
    semClipboardApi();
    comExecCommand(true);

    const botao = document.createElement("button");
    document.body.appendChild(botao);
    botao.focus();

    await copiarTexto("BR Code");

    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    expect(document.activeElement).toBe(botao);
  });

  it("não cria o textarea quando o texto é vazio", async () => {
    // `execCommand` sem seleção não copia nada, e um textarea vazio na tela é
    // só ruído: o helper devolve false sem mexer no DOM.
    semClipboardApi();
    const { exec } = comExecCommand(true);

    await expect(copiarTexto("")).resolves.toBe(false);

    expect(exec).not.toHaveBeenCalled();
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});