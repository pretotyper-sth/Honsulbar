from pathlib import Path
import argparse
import html
import re
import shutil
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent.parent
PAIRS = {
    'TERMS_OF_SERVICE.md': 'terms.html',
    'PRIVACY_POLICY.md': 'privacy.html',
    'REFUND_POLICY.md': 'refund.html',
    'AGE_SAFETY_POLICY.md': 'age-safety.html',
    'COMMUNITY_GUIDELINES.md': 'community.html',
    'honsulbar-monitoring-response-policy.md': 'monitoring.html',
}


def inline(text):
    text = html.escape(text.replace('`', ''))
    text = text.replace('&lt;br&gt;', '<br/>')
    return re.sub(r'\[([^]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', text)


def blocks(text):
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line:
            continue
        if line.startswith('|'):
            rows = []
            while True:
                if not re.fullmatch(r'[| :\-]+', line):
                    rows.append([cell.strip() for cell in line.strip('|').split('|')])
                if index >= len(lines) or not lines[index].strip().startswith('|'):
                    break
                line = lines[index].strip()
                index += 1
            yield 'table', rows
        elif line.startswith('#'):
            yield f'h{min(len(line.split()[0]),3)}', line.lstrip('#').strip()
        elif line.startswith('- '):
            yield 'li', line[2:]
        else:
            yield 'p', line.lstrip('> ')


def render_html(source, target):
    title = source.read_text().splitlines()[0].lstrip('# ')
    parts = []
    for kind, content in blocks(source.read_text()):
        if kind == 'table':
            parts.append('<table>' + ''.join('<tr>' + ''.join('<td>' + inline(cell) + '</td>' for cell in row) + '</tr>' for row in content) + '</table>')
        elif kind == 'li':
            parts.append('<ul><li>' + inline(content) + '</li></ul>')
        else:
            parts.append(f'<{kind}>' + inline(content) + f'</{kind}>')
    css = 'body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;color:#191f28;line-height:1.7;max-width:760px;margin:0 auto;padding:20px;font-size:14px;word-break:keep-all}h1{font-size:24px}h2{font-size:18px;margin-top:28px}h3{font-size:15px;margin-top:20px}a{color:#3182f6}table{border-collapse:collapse;width:100%;font-size:12px}td{border:1px solid #e5e8eb;padding:8px;vertical-align:top}tr:first-child{background:#f2f4f6}ul{padding-left:22px;margin:8px 0}'
    target.write_text(f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · 혼술바</title><style>{css}</style></head><body><nav><a href="index.html">혼술바 정책 문서</a></nav>' + '\n'.join(parts) + '</body></html>')


def render_pdf(source, target):
    pdfmetrics.registerFont(TTFont('Policy', '/Library/Fonts/Arial Unicode.ttf'))
    body = ParagraphStyle('body', fontName='Policy', fontSize=9.5, leading=15, wordWrap='CJK', spaceAfter=7, textColor=colors.HexColor('#333d4b'))
    styles = {
        'p': body,
        'li': ParagraphStyle('li', parent=body, leftIndent=10),
        'h1': ParagraphStyle('h1', parent=body, fontSize=21, leading=29, spaceAfter=17),
        'h2': ParagraphStyle('h2', parent=body, fontSize=13, leading=20, spaceBefore=14, spaceAfter=9, keepWithNext=True),
        'h3': ParagraphStyle('h3', parent=body, fontSize=11, leading=17, spaceBefore=8, keepWithNext=True),
    }
    cell_style = ParagraphStyle('cell', parent=body, fontSize=8, leading=12, spaceAfter=0)
    story = []
    for kind, content in blocks(source.read_text()):
        if kind == 'table':
            cells = [[Paragraph(inline(cell), cell_style) for cell in row] for row in content]
            table = Table(cells, colWidths=[487 / len(cells[0])] * len(cells[0]), repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f2f4f6')), ('GRID',(0,0),(-1,-1),0.4,colors.HexColor('#d1d6db')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            story.extend([table, Spacer(1,9)])
        else:
            text = ('- ' if kind == 'li' else '') + content.replace('—','-').replace('–','-')
            story.append(Paragraph(inline(text),styles[kind]))
    effective_date = re.search(r'^시행일:\s*(.+)$', source.read_text(), re.MULTILINE)
    effective_date = effective_date.group(1).strip() if effective_date else ''
    def footer(pdf, document):
        pdf.setFont('Policy',8)
        pdf.setFillColor(colors.HexColor('#6b7684'))
        pdf.drawString(54,30,f'상지컴퍼니 주식회사 | 혼술바 | {effective_date}')
        pdf.drawRightString(A4[0]-54,30,str(document.page))
    SimpleDocTemplate(str(target),pagesize=A4,rightMargin=54,leftMargin=54,topMargin=45,bottomMargin=50,title='혼술바 모니터링 및 대응 정책',author='상지컴퍼니 주식회사').build(story,onFirstPage=footer,onLaterPages=footer)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--monitoring-only', action='store_true')
    args = parser.parse_args()
    pairs = {'honsulbar-monitoring-response-policy.md': 'monitoring.html'} if args.monitoring_only else PAIRS
    for markdown, page in pairs.items():
        render_html(ROOT/'docs'/markdown, ROOT/'public/legal'/page)
    pdf = ROOT/'docs/honsulbar-monitoring-response-policy.pdf'
    render_pdf(ROOT/'docs/honsulbar-monitoring-response-policy.md', pdf)
    shutil.copyfile(pdf, ROOT/'public/legal'/pdf.name)
    print(f'정책 HTML {len(pairs)}개와 모니터링 정책 PDF 갱신 완료')
