/**
 * Cópia de texto que funciona onde `navigator.clipboard` não existe.
 *
 * A Clipboard API só existe em *secure context*: `https://…` ou `localhost`.
 * Aberta em `http://192.168.100.28:3000` — que é como o celular e a TV do bar
 * acessam o dev server — `navigator.clipboard` é `undefined` (não é só que a
 * promessa é rejeitada), então o `try/catch` em volta de `writeText` não
 * segurava o caso: o erro era do acesso ao propriedade, e o botão de copiar morria
 * junto com o player.
 *
 * O caminho 1 é a API moderna (assíncrona, é a que os navegadores preferem).
 * O caminho 2 é o `execCommand` sobre um `<textarea>` selecionado: deprecated,
 * mas é o único que funciona em HTTP — e vale como rede de segurança mesmo em
 * HTTPS, quando o usuário nega a permissão de clipboard.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  // Nada a copiar: o `execCommand` sem seleção não copia e ainda deixa um
  // textarea na tela. Os dois call sites já bloqueiam o botão nesse caso, mas o
  // helper é a rede de segurança — não vai escrever string vazia na área de
  // transferência de ninguém.
  if (!texto || typeof document === "undefined") return false;

  // 1) Clipboard API. Ausente fora de secure context; pode falhar por permissão.
  // O `?.` no acesso não serve como teste: `await undefined?.writeText()` não
  // lança nada, devolve `undefined` e o helper juraria ter copiado. A
  // existência da função é que decide qual caminho segue.
  const clipboard = navigator.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(texto);
      return true;
    } catch {
      // Cai para o caminho 2.
    }
  }

  // 2) execCommand: precisa do elemento no documento e com o texto selecionado.
  const anterior = document.activeElement;
  const area = document.createElement("textarea");
  area.value = texto;
  // Fora da tela, mas não `display:none`/`hidden`: elemento não renderizado não
  // aceita seleção, e aí o comando copiaria vazio.
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.width = "1px";
  area.style.height = "1px";
  area.style.padding = "0";
  area.style.border = "0";
  area.style.outline = "none";
  area.style.boxShadow = "none";
  area.style.background = "transparent";
  area.style.opacity = "0";
  document.body.appendChild(area);

  try {
    area.select();
    area.setSelectionRange(0, area.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    // Devolve o foco a quem estava focando: sem isso, o botão que a pessoa
    // apertou perde o foco e o teclado dela vai para o body.
    if (anterior instanceof HTMLElement) anterior.focus();
  }
}