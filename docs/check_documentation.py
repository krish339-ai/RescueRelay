#!/usr/bin/env python3
"""Check documentation structure and required local links with the Python standard library.

This check does not replace visual inspection, application tests, or source review.
Run from any directory: python docs/check_documentation.py
"""
from __future__ import annotations
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent

class GuideParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids: list[str] = []
        self.links: list[str] = []
        self.author: str | None = None
        self.sections = 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'a' and 'href' in attrs:
            self.links.append(attrs['href'])
        if tag == 'meta' and attrs.get('name') == 'author':
            self.author = attrs.get('content')
        if tag == 'section':
            self.sections += 1

def check():
    errors: list[str] = []
    expected = ['build-guide.html', 'RescueRelay-Project-Documentation.docx', 'generate_project_doc.py',
                'evidence.json', 'api-contract.md', 'verification.md', 'implementation-plan.md',
                'authoring.md', 'requirements-docs.txt', 'project-plan.html', 'project-plan.json', 'generate_project_plan.py', 'ai-api-contract.md', 'ai-service-decisions.json', 'service_matrix.py']
    for name in expected:
        if not (ROOT / name).is_file():
            errors.append(f'Missing required file: {name}')
    guide = ROOT / 'build-guide.html'
    parser = GuideParser()
    if guide.exists():
        parser.feed(guide.read_text(encoding='utf-8'))
        if parser.author != 'Krishna Kallamadi':
            errors.append('Guide author metadata is missing or incorrect')
        if len(parser.ids) != len(set(parser.ids)):
            errors.append('Guide contains duplicate element IDs')
        for href in parser.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            if url.path and not (ROOT / unquote(url.path)).is_file():
                errors.append(f'Guide companion link does not exist: {href}')
            if not url.path and url.fragment and url.fragment not in parser.ids:
                errors.append(f'Guide anchor does not exist: {href}')
    docx = ROOT / 'RescueRelay-Project-Documentation.docx'
    document_text = ''
    if docx.exists():
        with ZipFile(docx) as package:
            xml = ET.fromstring(package.read('word/document.xml'))
            document_text = ' '.join(xml.itertext())
            core = ET.fromstring(package.read('docProps/core.xml'))
            creator = core.find('{http://purl.org/dc/elements/1.1/}creator')
            if creator is None or creator.text != 'Krishna Kallamadi':
                errors.append('DOCX creator metadata is missing or incorrect')
    plan_path = ROOT / 'project-plan.json'
    if plan_path.exists():
        plan = json.loads(plan_path.read_text())
        if [stage['number'] for stage in plan['stages']] != list(range(1, 18)):
            errors.append('Project plan must contain baseline stages 1 through 12 and AI extension stages 13 through 17 in order')
        release = plan.get('current_release')
        if release:
            if release.get('status') not in {'verification_pending', 'verified'}:
                errors.append('Invalid current release verification status')
            if release.get('status') == 'verified' and release.get('pending'):
                errors.append('Verified current release still contains pending gates')
            if not all(release.get(field) for field in ('title', 'scope', 'evidence', 'boundary')):
                errors.append('Current release must record scope, evidence and limits')
        for stage in plan['stages']:
            expected_phase = 'baseline' if stage['number'] <= 12 else 'ai'
            if stage.get('phase') != expected_phase:
                errors.append(f'Incorrect phase for stage: {stage["number"]}')
            if stage['status'] not in {'complete', 'active', 'pending'}:
                errors.append(f'Invalid stage status: {stage["number"]}')
            if stage['status'] == 'complete' and not all(c['done'] for c in stage['checks']):
                errors.append(f'Complete stage contains unverified gates: {stage["number"]}')
    plan_html = ROOT / 'project-plan.html'
    if plan_html.exists():
        plan_parser = GuideParser()
        plan_parser.feed(plan_html.read_text(encoding='utf-8'))
        if len(plan_parser.ids) != len(set(plan_parser.ids)):
            errors.append('Plan contains duplicate element IDs')
        for href in plan_parser.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            if url.path and not (ROOT / unquote(url.path)).is_file():
                errors.append(f'Plan companion link does not exist: {href}')
            if not url.path and url.fragment and url.fragment not in plan_parser.ids:
                errors.append(f'Plan anchor does not exist: {href}')
    decisions_path = ROOT / 'ai-service-decisions.json'
    if decisions_path.exists():
        decisions = json.loads(decisions_path.read_text())
        services = decisions['services']
        names = [item['service'] for item in services]
        if len(services) != 17 or len(set(names)) != 17:
            errors.append('Service matrix must contain exactly 17 distinct services')
        provider_ids = {item['runtime_provider_id'] for item in services if item['runtime_provider_id']}
        shared_path = ROOT.parent / 'packages/shared/src/ai.ts'
        registry_path = ROOT.parent / 'apps/api/src/ai/config.ts'
        if shared_path.exists() and registry_path.exists():
            shared = shared_path.read_text()
            union = re.search(r'export type AiProviderId\s*=([^;]+);', shared)
            declared = set(re.findall(r"[\"']([^\"']+)[\"']", union.group(1))) if union else set()
            registry = registry_path.read_text().split('const enabled=', 1)[0]
            configured = set(re.findall(r"([a-z][a-z0-9]*)\s*:\s*\{\s*label\s*:", registry))
            if provider_ids != declared or provider_ids != configured:
                errors.append(f'Matrix/code provider mismatch: matrix={sorted(provider_ids)} shared={sorted(declared)} registry={sorted(configured)}')
        hosted_ids = {'fireworks', 'nebius', 'pinecone', 'tavily', 'keenable', 'mem0', 'langsmith', 'llamaparse'}
        if decisions.get('live_verification_scope') != 'private_chatgpt_site':
            errors.append('Service matrix must identify the hosted validation scope')
        report_name = decisions.get('validation_report', '')
        if not report_name or not (ROOT / report_name).is_file():
            errors.append('Hosted validation evidence report is missing')
        if {s['runtime_provider_id'] for s in services if s['live_verified']} != hosted_ids:
            errors.append('Hosted live coverage differs from the eight recorded provider passes')
        for item in services:
            pid = item['runtime_provider_id']
            if item['runtime_provider_id']:
                expected_status = ('hosted_enabled', 'hosted_live_verified') if pid in hosted_ids else ('local_enabled_hosted_disabled', 'local_inference_verified_hosted_untested') if pid == 'openai' else ('parked_disabled', 'mock_verified')
                if item['implementation_status'] != 'source_implemented' or (item['activation_status'], item['verification_status']) != expected_status:
                    errors.append(f'Runtime status mismatch: {item["service"]}')
                if pid in hosted_ids and (item.get('validation_environment') != 'private_chatgpt_site' or item.get('validation_date') != '2026-11-07' or item.get('validation_report') != report_name or not item.get('validated_operation')):
                    errors.append(f'Hosted pass lacks scoped, dated evidence: {item["service"]}')
            elif item['implementation_status'] != 'deferred' or item['verification_status'] != 'not_implemented' or item['activation_status'] != 'not_activated':
                errors.append(f'Deferred status mismatch: {item["service"]}')
        from service_matrix import service_matrix_html
        expected_matrix = service_matrix_html()
        for name in ('build-guide.html', 'project-plan.html'):
            if expected_matrix not in (ROOT / name).read_text():
                errors.append(f'{name} does not contain the canonical generated service matrix')
        if decisions.get('docx_matrix_included'):
            for item in services:
                for field in ('service', 'role', 'status'):
                    if item[field] not in document_text:
                        errors.append(f'DOCX canonical service {field} mismatch: {item["service"]}')
    return {'passed': not errors, 'html_sections': parser.sections, 'html_links': len(parser.links), 'errors': errors,
            'service_entries': len(services) if decisions_path.exists() else 0,
            'docx_service_matrix_included': decisions.get('docx_matrix_included', False) if decisions_path.exists() else False,
            'scope': 'Files, navigation, author metadata and canonical service/code registry consistency; visual and application review are separate.'}

if __name__ == '__main__':
    result = check()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result['passed'] else 1)
