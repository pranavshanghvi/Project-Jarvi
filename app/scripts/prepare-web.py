#!/usr/bin/env python3
"""Turns a fresh `expo export -p web` folder into the folder that gets published.

Why this exists: the export has no link-preview picture, no Home Screen icon and no page
description, so a shared link would show as a bare address. It also must be copied to a clean
folder before publishing, so nothing else that happens to be in the export folder goes online.

Usage:  python3 scripts/prepare-web.py <export folder> <new empty folder to publish>
Then:   cd <new folder> && vercel deploy --prod --yes   (with the jarvi-web project ids set)
"""
import os, shutil, sys

SITE = 'https://mybitelog.vercel.app'
TITLE = 'BiteLog'
TAGLINE = 'Food in, energy out'
DESCRIPTION = ('Know what you eat against what you burn. Photograph your meals, bring in the calories '
               'your Apple Watch counts, and see where the day, the week or the year stands.')
HEAD = f'''
<meta name="description" content="{DESCRIPTION}">
<meta name="theme-color" content="#07080F">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{TITLE}">
<meta property="og:title" content="{TITLE}: {TAGLINE}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{TITLE}: {TAGLINE}">
<meta name="twitter:description" content="{DESCRIPTION}">
<meta name="twitter:image" content="{SITE}/og-image.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<meta name="apple-mobile-web-app-title" content="{TITLE}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
'''

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source, target = sys.argv[1], sys.argv[2]
    if os.path.exists(target) and os.listdir(target):
        sys.exit(f'{target} is not empty; give a new folder so nothing stale gets published')
    os.makedirs(target, exist_ok=True)
    # Only the web pages themselves: never settings files or anything else lying in the export.
    for name in ['_expo', 'assets']:
        shutil.copytree(os.path.join(source, name), os.path.join(target, name))
    for name in ['favicon.ico', 'metadata.json']:
        if os.path.exists(os.path.join(source, name)):
            shutil.copy(os.path.join(source, name), os.path.join(target, name))
    brand = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'brand')
    for name in ['og-image.png', 'apple-touch-icon.png', 'icon-192.png']:
        shutil.copy(os.path.join(brand, name), os.path.join(target, name))
    html = open(os.path.join(source, 'index.html'), encoding='utf-8').read()
    if '</head>' not in html:
        sys.exit('index.html has no </head>; the export format has changed, update this script')
    html = html.replace('</head>', HEAD + '</head>', 1)
    open(os.path.join(target, 'index.html'), 'w', encoding='utf-8').write(html)
    print('ready to publish:', target, '|', ', '.join(sorted(os.listdir(target))))

if __name__ == '__main__':
    main()
