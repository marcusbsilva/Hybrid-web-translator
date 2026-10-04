import asyncio
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import corpus_crawler as crawler
from aiohttp import web
from live_dictionary import load

class ConfigTests(unittest.TestCase):
    def test_default_server_and_external_list(self):
        args = crawler.build_parser().parse_args([])
        self.assertEqual(args.translate_url, 'http://localhost:5000')
        self.assertEqual(args.sites_file, Path(crawler.__file__).with_name('sites.txt'))
        self.assertEqual(len(crawler.configured_sites(args)), 4)
        self.assertEqual(crawler.build_parser().parse_args(['--no-translate']).translate_url, None)
        self.assertEqual(crawler.build_parser().parse_args(['--translate-url', 'http://localhost:5001']).translate_url, 'http://localhost:5001')

    def test_file_encoding_comments_duplicates_and_host_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/'sites.txt'
            file.write_text('# comment\n\nhttps://custom.example/forum\nhttps://custom.example/forum\nhttps://www.second.example/\n', encoding='utf-8-sig')
            args = crawler.build_parser().parse_args(['--sites-file', str(file)])
            seeds = crawler.configured_sites(args)
            self.assertEqual(len(seeds), 2)
            crawler.configure_hosts(seeds, [])
            self.assertTrue(crawler.allowed_url('https://custom.example/thread-1'))
            self.assertTrue(crawler.allowed_url('https://www.custom.example/thread-1'))
            self.assertFalse(crawler.allowed_url('https://other.example/thread-1'))
            self.assertFalse(crawler.allowed_url('https://private.custom.example/thread-1'))
            self.assertFalse(crawler.allowed_url('https://custom.example/image.png'))
            file.write_text('ftp://custom.example/\n')
            with self.assertRaises(ValueError): crawler.configured_sites(args)
            file.write_text('# no sites\n')
            with self.assertRaises(ValueError): crawler.configured_sites(args)
            file.unlink()
            with self.assertRaises(ValueError): crawler.configured_sites(args)
            args.seed=['https://override.example/']
            self.assertEqual(crawler.configured_sites(args), ['https://override.example/'])

    def test_shell_launcher_forwards_arguments_from_other_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); binary=root/'python3'; log=root/'args.txt'
            binary.write_text('#!/bin/sh\nprintf "%s\\n" "$PWD" "$@" > "$CRAWLER_TEST_LOG"\n')
            binary.chmod(0o700)
            script=Path(crawler.__file__).with_name('crawl.sh')
            result=subprocess.run(['bash',str(script),'--sites-file','a list.txt','--no-translate'],cwd=root,env={**os.environ,'PATH':str(root)+os.pathsep+os.environ['PATH'],'CRAWLER_TEST_LOG':str(log)},capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(log.read_text().splitlines(),[str(script.parent.parent),'tools/corpus_crawler.py','--sites-file','a list.txt','--no-translate'])

class LearningTests(unittest.IsolatedAsyncioTestCase):
    async def test_external_site_still_learns_and_skips_known_text(self):
        calls=[]
        async def translate(request):
            body=await request.json();calls.append(body)
            return web.json_response({'translatedText':['New phrase' for _ in body['q']]})
        app=web.Application();app.router.add_post('/translate',translate)
        runner=web.AppRunner(app);await runner.setup();site=web.TCPSite(runner,'127.0.0.1',0);await site.start()
        port=site._server.sockets[0].getsockname()[1]
        try:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);file=root/'sites.txt';file.write_text('https://fixture.example/\n')
                args=crawler.build_parser().parse_args(['--sites-file',str(file),'--translate-url',f'http://127.0.0.1:{port}','--output',str(root/'corpus'),'--update-dictionaries',str(root/'dict'),'--live-jsonl',str(root/'learned.jsonl'),'--max-pages','2','--delay','0','--ignore-robots'])
                async def fetch(_,url):return 200,'<p>未收录的新短语</p><a href="/next">Next</a>',url
                with patch.object(crawler,'fetch_static',fetch):await crawler.crawl(args)
                self.assertEqual(len(calls),1)
                self.assertEqual(load(root/'dict'/'zh.js'),{'未收录的新短语':'New phrase'})
        finally:await runner.cleanup()

if __name__=='__main__':unittest.main()
