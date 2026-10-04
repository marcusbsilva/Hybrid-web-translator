# Hybrid Web Translator

**Dicionários locais primeiro. Serviços de tradução opcionais quando você precisar.**

[English](README.md) · [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio) · [Fontes dos dicionários](THIRD_PARTY_NOTICES.md)

O Hybrid Web Translator é uma extensão Manifest V3 para Chrome que traduz páginas usando dicionários offline rápidos e preservando o DOM. Ela detecta idiomas e pode ampliar seus dicionários locais por meio de um serviço de fallback via API, ativado manualmente.

A versão **6.0.1** apresenta uma interface renovada e integração nativa com o **LocalTranslator Studio**, um servidor dedicado de tradução local que funciona no seu computador.

## Interface

![Interface do Hybrid Web Translator](docs/images/popup-v6.png)

[Ver o tema escuro](docs/images/popup-v6-dark.png)

## Funcionalidades

- **Detecção de idioma:** usa **Detect language → English** como padrão, com seleção dos idiomas de origem e destino.
- **Dicionários offline:** chinês, vietnamita, tailandês, russo, português, espanhol, francês e japonês, usando inglês como idioma intermediário para outros destinos.
- **Aprendizado:** índices bilíngues locais e traduções aprendidas armazenadas separadamente para cada par de idiomas.
- **Suporte a páginas:** processa textos dinâmicos e atributos de texto compatíveis, preservando scripts e campos editáveis.
- **Fallback manual:** traduz textos não cobertos pelos dicionários usando o provedor selecionado; a ativação se aplica imediatamente à página atual.
- **Provedores disponíveis:** LocalTranslator Studio, Community Lingva, Google Cloud Translation e DeepL.
- **Diagnósticos e ferramentas:** teste de conexão, nova tentativa para textos restantes, importação/exportação JSON e estatísticas locais de uso.
- **Interface legível:** temas claro e escuro acompanham a preferência do sistema.

A quantidade de entradas indica o tamanho do vocabulário, não uma garantia de cobertura de frases completas. Com o fallback desativado, textos desconhecidos podem permanecer sem tradução. Os dicionários locais e as traduções já aprendidas funcionam sem um servidor de tradução.

## Instalação

1. Extraia o ZIP da extensão para uma nova pasta.
2. Abra `chrome://extensions` ou `edge://extensions`.
3. Ative o **Modo do desenvolvedor** e selecione **Carregar sem compactação**.
4. Escolha a pasta que contém `manifest.json`.
5. Recarregue uma vez as abas de sites já abertas para ativar a extensão.

### Atualizando uma instalação existente

Substitua os arquivos na pasta que o navegador já carrega e clique em **Recarregar** no cartão da extensão. Reabra o painel e confirme que o cabeçalho mostra **6.0.1**. Recarregue uma vez as abas de sites já abertas após uma atualização.

Mantenha a mesma pasta de instalação para preservar a identidade da extensão no navegador e os dicionários armazenados. Remova arquivos obsoletos separadamente ao copiar uma nova versão sobre uma instalação antiga. Depois disso, mudanças nas configurações e a ativação manual do fallback se aplicam sem recarregar a página.

## Tradução local e privada com LocalTranslator Studio

Esta versão inclui integração pronta para uso com o **[LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio)**. Instale o aplicativo separadamente para usá-lo como servidor local de tradução da extensão.

1. Baixe e configure o LocalTranslator Studio seguindo o README do aplicativo.
2. Inicie o servidor com `start.bat` no Windows ou `bash start.sh` no Linux.
3. Na seção **Translation service** da extensão, selecione **LocalTranslator Studio**.
4. Defina **Local server address** como `http://localhost:5000`, ou use a porta que você configurou.
5. Clique em **Test connection and translation**.
6. Ative **Hybrid learning fallback** manualmente quando quiser traduzir textos não cobertos pelos dicionários.

Não é necessária uma chave de API. Ao usar um endereço de loopback, como `localhost` ou `127.0.0.1`, a tradução é processada no seu computador. A extensão não aplica um limite diário de fallback ao LocalTranslator Studio em endereços de loopback.

## Outros provedores e privacidade

| Provedor | Configuração | Onde o texto é processado |
|---|---|---|
| LocalTranslator Studio | Endereço do servidor local | No seu computador quando usado um endereço de loopback |
| Community Lingva | URL da instância | Serviço externo da comunidade |
| Google Cloud Translation | Chave de API | Serviço externo do Google |
| DeepL | Chave de API | Serviço externo do DeepL |

Com o fallback desativado, a consulta aos dicionários permanece local. Ao ativá-lo, os textos elegíveis da página são enviados ao provedor selecionado. Escolher outro idioma não ativa o fallback automaticamente.

Configurações, chaves de API e traduções aprendidas ficam no armazenamento local da extensão. Instâncias públicas podem ficar indisponíveis. Consulte [SECURITY.md](SECURITY.md) para detalhes sobre segurança e privacidade.

## Dicionários e crawler

O crawler coleta apenas texto, lê as URLs dos sites em `tools/sites.txt`, ignora frases conhecidas e grava os resultados incrementais dos dicionários durante a execução. Ele coleta textos sem baixar imagens ou outros recursos das páginas.

O servidor de tradução padrão é `http://localhost:5000`, portanto informar o endereço é opcional. Instale os requisitos do crawler conforme seu guia, adicione os sites que deseja analisar em `tools/sites.txt` e execute um comando na pasta principal do projeto.

### Windows CMD

```bat
tools\crawl.bat
```

Para usar outro endereço ou porta:

```bat
tools\crawl.bat --translate-url http://localhost:5001
```

### Linux

```sh
bash tools/crawl.sh
```

Para usar outro endereço ou porta:

```sh
bash tools/crawl.sh --translate-url http://localhost:5001
```

Adicione `--no-translate` para coletar textos sem solicitar traduções. Resultados do crawler, caches e arquivos Python compilados são gerados localmente e não estão incluídos nesta versão.

## Licença e créditos

O código original da extensão usa a licença [MIT](LICENSE). Os dicionários mantêm suas licenças individuais CC BY-SA, GPL e demais termos específicos de cada fonte.

Avisos obrigatórios, cabeçalhos de créditos, manifestos de fontes e arquivos de código-fonte correspondentes, quando aplicáveis, estão incluídos no projeto e em `third_party`. Preserve esses arquivos ao redistribuir pacotes de dicionários. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para créditos e detalhes das fontes.

**Aplicativo relacionado:** [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio)  
**Autor:** [Marcus Silva](https://github.com/marcusbsilva)  
**Repositório da extensão:** [Hybrid Web Translator](https://github.com/marcusbsilva/Hybrid-web-translator)
