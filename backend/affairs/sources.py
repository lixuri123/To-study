from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


def canonical_url(value):
    if not value:
        return ""
    url = urlsplit(value.strip())
    query = [(k, v) for k, v in parse_qsl(url.query, keep_blank_values=True) if not k.lower().startswith("utm_") and k.lower() not in {"from", "isappinstalled", "scene", "subscene", "clicktime", "enterid"}]
    return urlunsplit((url.scheme.lower(), url.netloc.lower(), url.path or "/", urlencode(sorted(query)), ""))
