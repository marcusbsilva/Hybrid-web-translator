# Hybrid Web Translator

**Traduções locais primeiro. Tradução online opcionais quando você precisar.**

[English](README.md) · [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio) · [Licenças dos dicionários](THIRD_PARTY_NOTICES.md)

Extensão Manifest V3 para traduzir páginas com dicionários locais, detectar idiomas e aprender traduções completas obtidas por um fallback ativado manualmente. A versão **6.0.1** renova a interface e integra o provedor local ao LocalTranslator Studio.

![Interface da extensão](docs/images/popup-v6.png)

[Ver tema escuro](docs/images/popup-v6-dark.png)

## Funcionalidades

- Detecção de idioma e inglês como destino padrão, com possibilidade de alteração.
- Dicionários de chinês, vietnamita, tailandês, russo, português, espanhol, francês e japonês; inglês como ponte para outros destinos.
- Pares bilíngues locais e traduções aprendidas separadas por origem/destino.
- Processamento de texto dinâmico e atributos compatíveis, preservando scripts e campos editáveis.
- Fallback manual com efeito imediato na página aberta.
- Provedores LocalTranslator Studio, Lingva, Google Cloud Translation e DeepL.
- Diagnóstico de conexão, nova tentativa para texto restante, importação/exportação JSON e estatísticas locais.
- Interface em inglês, com tema claro/escuro conforme a preferência do sistema.

A quantidade de entradas representa vocabulário, não cobertura garantida de frases inéditas. Textos desconhecidos podem permanecer sem tradução quando o fallback estiver desativado. Os dicionários e traduções aprendidas funcionam sem servidor.

## Instalação

1. Extraia o ZIP em uma pasta nova para evitar arquivos obsoletos.
2. Abra `chrome://extensions` ou `edge://extensions`.
3. Ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione a pasta com `manifest.json`.
4. Reabra as páginas antigas uma vez após instalar/atualizar a extensão.

Depois disso, alterações de configuração e ativação do fallback funcionam imediatamente. Para manter a identidade e os dados de uma instalação sem compactação existente, substitua os arquivos no mesmo diretório usado pelo navegador; remova separadamente arquivos gerados obsoletos desse diretório.

## Tradução local com Studio

Há links **Get LocalTranslator Studio** no cabeçalho e em um cartão ao lado do endereço do servidor.

1. Baixe e instale separadamente o [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio).
2. Inicie o servidor com `start.bat` no Windows ou `bash start.sh` no Linux.
3. Selecione **LocalTranslator Studio** na extensão e informe `http://localhost:5000` ou a porta escolhida.
4. Clique em **Test connection and translation**.
5. Ative **Hybrid learning fallback** manualmente para traduzir textos sem cobertura local.

A extensão não instala, inclui nem inicia o servidor. O Studio não precisa de chave de API. Sua página Models permite gerenciar idiomas; o diagnóstico informa modelos ausentes e erros de tradução.

Endereços locais em `localhost`, `127.0.0.1` e `[::1]` não têm limite diário de fallback; o uso continua contabilizado. Serviços externos respeitam o limite configurado. Escolher outro idioma não ativa o fallback automaticamente.

Configurações antigas do provedor local são migradas para Studio no primeiro uso. O endereço anterior válido é preservado quando disponível, assim como as traduções aprendidas e a preferência manual de fallback. Inicie o aplicativo Studio separadamente nesse endereço.

## Provedores e privacidade

| Provedor | Configuração | Processamento |
|---|---|---|
| LocalTranslator Studio | Endereço do servidor | No computador quando o endereço for local |
| Community Lingva | URL da instância | Serviço externo comunitário |
| Google Cloud Translation | Chave de API | Serviço externo Google |
| DeepL | Chave de API | Serviço externo DeepL |

Com o fallback desativado, a consulta aos dicionários permanece local. Ao ativá-lo, textos elegíveis são enviados ao provedor selecionado. Chaves, preferências e traduções aprendidas ficam no armazenamento local da extensão. Instâncias públicas podem ficar indisponíveis; diagnósticos não garantem disponibilidade. Consulte [SECURITY.md](SECURITY.md).

## Dicionários e crawler

Foram preservados os dicionários curados/gerais, pares bilíngues, manifestos de origem e licenças. Traduções curadas têm prioridade; sentidos ambíguos de glossários são excluídos da correspondência automática. Consulte [README-DICTIONARIES.md](README-DICTIONARIES.md) e [tools/readme-ptbr.md](tools/readme-ptbr.md).

O crawler coleta textos, lê os sites de `tools/sites.txt`, pula frases conhecidas e grava atualizações incrementais. O servidor padrão é `http://localhost:5000`; informar outro endereço é opcional:

```bat
tools\crawl.bat
tools\crawl.bat --translate-url http://localhost:5001
```

```sh
bash tools/crawl.sh
bash tools/crawl.sh --translate-url http://localhost:5001
```

Use `--no-translate` para somente coletar texto. Instale as dependências conforme o guia. Resultados do crawler, caches e arquivos Python compilados são gerados localmente e não acompanham o pacote.

## Desenvolvimento e validação

Os testes principais usam Node.js. Testes de navegador também precisam de Playwright e Chromium:

```sh
node tests/engine.test.cjs
node tests/worker.test.cjs
node tests/routing.test.cjs
node tests/local-budget.test.cjs
node tests/provider-migration.test.cjs
```

Veja [docs/VALIDATION.md](docs/VALIDATION.md) para verificações reais e limitações. APIs simuladas não substituem um teste da extensão instalada. Os dicionários não são modelos neurais e não garantem resultados idênticos aos do Google.

O pacote inclui implementação, testes, fontes de dicionários e créditos. Não inclui distribuição de servidor, inicializadores de contêiner, bancos do crawler nem ZIP duplicado de dicionários.

## Licença

Código original: [MIT](LICENSE). Os dicionários mantêm os termos CC BY-SA / GPL e demais licenças indicadas por fonte. Créditos e arquivos de código-fonte correspondentes permanecem em `third_party` e nos manifestos. Preserve esses materiais ao redistribuir.

Aplicativo relacionado: [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio). Autor: [Marcus Silva](https://github.com/marcusbsilva).

### Atualizando para 6.0.1

Extraia o pacote completo na pasta indicada em **Detalhes da extensão → Caminho da extensão**, clique em **Recarregar** em `chrome://extensions` (ou `edge://extensions`) e reabra o painel. O cabeçalho deve mostrar **6.0.1**. O painel carrega `popup-v6.0.1.css` e usa largura fixa de 420 px.
