"""Shared, escaped HTML rendering of the explicit 17-service decision matrix."""
import html
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def service_matrix_html():
    data=json.loads((ROOT/'ai-service-decisions.json').read_text())
    e=html.escape
    rows=[]
    for item in data['services']:
        rows.append(f'<tr><td><a href="{e(item["source"],quote=True)}">{e(item["service"])}</a></td><td>{e(item["role"])}</td><td>{e(item["status"])}</td><td>{e(item["gate"])}</td></tr>')
    count=sum(bool(item['runtime_provider_id']) for item in data['services'])
    summary=f'<p class="small"><strong>{len(data["services"])} services tracked:</strong> {count} selected runtime adapters and {len(data["services"])-count} alternatives, optional tools or deferred services. {e(data["live_summary"])}</p><p><a href="{e(data["validation_report"], quote=True)}">Read the hosted live validation evidence and limits</a>.</p>'
    return summary+'<div class="table-wrap" role="region" aria-label="Scrollable service decision matrix" tabindex="0"><table><thead><tr><th>Service</th><th>Role in the product plan</th><th>Current decision and evidence</th><th>Acceptance gate</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></div>'

def update_guide():
    p=ROOT/'build-guide.html';s=p.read_text();start='<!-- SERVICE_MATRIX_START -->';end='<!-- SERVICE_MATRIX_END -->'
    if start not in s or end not in s:raise ValueError('Guide matrix markers missing')
    prefix,rest=s.split(start,1);_,suffix=rest.split(end,1)
    p.write_text(prefix+start+'\n'+service_matrix_html()+'\n'+end+suffix,encoding='utf-8')

if __name__=='__main__':update_guide()
