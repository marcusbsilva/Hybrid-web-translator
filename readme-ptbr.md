# Hybrid Web Translator

**Tradução local primeiro. Serviços de tradução opcionais quando você precisar.**

[English](README.md) · [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio) · [Fontes dos dicionários](THIRD_PARTY_NOTICES.md)

O Hybrid Web Translator é uma extensão Manifest V3 para Chrome que traduz páginas usando dicionários offline rápidos e preservando o DOM. Ela inclui integração nativa com o LocalTranslator Studio para tradução opcional por uma API local. Confira: [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio).

## Interface

![Interface do Hybrid Web Translator](docs/images/popup-v6-dark.png)

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

## Tradução local e privada com LocalTranslator Studio

Esta versão inclui integração pronta para uso com o LocalTranslator Studio. Instale o aplicativo separadamente para usá-lo como servidor local de tradução da extensão.

1. Baixe e configure o **[LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio)**.
2. Inicie o servidor com `start.bat` no Windows ou `bash start.sh` no Linux.
3. Na seção **Translation service** da extensão, selecione **LocalTranslator Studio**.
4. Defina **Local server address** como `http://localhost:5000`, ou use a porta que você configurou.
5. Clique em **Test connection and translation**.
6. Ative **Hybrid learning fallback** manualmente quando quiser traduzir textos não cobertos pelos dicionários.

Não é necessária uma chave de API. Ao usar um endereço de loopback, como `localhost` ou `127.0.0.1`, a tradução é processada no seu computador.

## Outros provedores e privacidade

| Provedor | Configuração | Onde o texto é processado |
|---|---|---|
| LocalTranslator Studio | Endereço do servidor local | No seu computador quando usado um endereço de loopback |
| Community Lingva | URL da instância | Serviço externo da comunidade |
| Google Cloud Translation | Chave de API | Serviço externo do Google |
| DeepL | Chave de API | Serviço externo do DeepL |

Com o fallback desativado, a consulta aos dicionários permanece local. Ao ativá-lo, os textos elegíveis da página são enviados ao provedor selecionado.

Configurações, chaves de API e traduções aprendidas ficam no armazenamento local da extensão. Instâncias públicas podem ficar indisponíveis. Consulte [SECURITY.md](SECURITY.md) para detalhes sobre segurança e privacidade.

## Licença e créditos

O código original da extensão usa a licença [MIT](LICENSE). Os dicionários mantêm suas licenças individuais CC BY-SA, GPL e demais termos específicos de cada fonte.

Avisos obrigatórios, cabeçalhos de créditos, manifestos de fontes e arquivos de código-fonte correspondentes, quando aplicáveis, estão incluídos no projeto e em `third_party`. Preserve esses arquivos ao redistribuir pacotes de dicionários. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para créditos e detalhes das fontes.

**Aplicativo relacionado:** [LocalTranslator Studio](https://github.com/marcusbsilva/LocalTranslator-Studio)  
**Autor:** [Marcus Silva](https://github.com/marcusbsilva)  
**Repositório da extensão:** [Hybrid Web Translator](https://github.com/marcusbsilva/Hybrid-web-translator)
