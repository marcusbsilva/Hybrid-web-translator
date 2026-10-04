# Crawler — uso automático

Substitua a pasta `tools` do projeto por esta versão, mantendo a pasta `dictionaries` ao lado dela. Instale as dependências com `python -m pip install -r tools/requirements.txt` e deixe o LocalTranslator Studio funcionando.

1. Edite `tools/sites.txt`: um endereço completo por linha. Linhas vazias e comentários iniciados por `#` são ignorados. A lista é carregada ao iniciar o crawler.
2. Execute `tools\crawl.bat` no Windows ou `bash tools/crawl.sh` no Linux.

O endereço **http://localhost:5000** é usado automaticamente. O crawler continua pulando termos conhecidos e salva cada lote traduzido imediatamente nos dicionários. O script não inicia o LocalTranslator Studio/Docker; execute o iniciador do projeto antes, se necessário.

Opções:

```bat
tools\crawl.bat --translate-url http://localhost:5001
tools\crawl.bat --sites-file tools\minha-lista.txt
tools\crawl.bat --no-translate
tools\crawl.bat --translation-batch-size 1
```

`--translate-url` é opcional e serve para mudar o servidor. `--no-translate` coleta somente texto. `--seed URL` substitui a lista do TXT. Os hosts da lista e suas variantes com/sem `www` são permitidos automaticamente; o crawler mantém o respeito ao robots.txt e os intervalos entre requisições.

Alterar os arquivos em disco não atualiza automaticamente uma extensão já carregada. Use a importação de JSON ou recarregue a extensão. A escolha manual do fallback da extensão permanece independente do crawler.
