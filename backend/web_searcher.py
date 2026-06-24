# -*- coding: utf-8 -*-
import urllib.request
import urllib.parse
import re

def search_web(query, limit=5):
    """
    Performs a web search via DuckDuckGo HTML search and parses results.
    Returns a list of dicts: {"title": ..., "url": ..., "snippet": ...}
    """
    if not query:
        return []
        
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            
        # Parse titles, URLs, and snippets from DuckDuckGo HTML results
        titles_urls = re.findall(r'<h2 class="result__title">\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
        snippets = re.findall(r'<a class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL)
        
        results = []
        for i in range(min(len(titles_urls), len(snippets))):
            raw_url = titles_urls[i][0]
            raw_title = titles_urls[i][1]
            raw_snippet = snippets[i]
            
            # Clean HTML tags
            title = re.sub(r'<[^>]*>', '', raw_title).strip()
            snippet = re.sub(r'<[^>]*>', '', raw_snippet).strip()
            
            # Clean URL redirection
            url = raw_url
            if "uddg=" in url:
                try:
                    url = urllib.parse.unquote(url.split("uddg=")[1].split("&")[0])
                except Exception:
                    pass
                    
            if "duckduckgo.com/y.js" in url:
                continue
                
            results.append({
                "title": title,
                "url": url,
                "snippet": snippet
            })
            
            if len(results) >= limit:
                break
                
        return results
    except Exception as e:
        print(f"Error searching DuckDuckGo: {e}")
        return []
