import re
import sys

def extract_emojis_from_file(filepath):
    """파일에서 이모지가 포함된 라인 추출"""
    # 이모지 패턴 - 유니코드 범위
    emoji_ranges = (
        "[\U0001F300-\U0001FAFF]"   # 이모지 주요 범위
        "|[\U0001F000-\U0001F02F]"  # 마작, 도미노
        "|[\U0001F0A0-\U0001F0FF]"  # 플레잉카드
        "|[\U0001F100-\U0001F1FF]"  # 둘러싼 문자
        "|[\U0001F200-\U0001F2FF]"  # 둘러싼 이상 보충
        "|[\u2600-\u27BF]"          # 잡화, 딩뱃
        "|[\u2640\u2642\u2764]"     # 특정 기호
    )
    
    emoji_pattern = re.compile(emoji_ranges)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except:
        return None
    
    results = []
    for line_num, line in enumerate(lines, 1):
        matches = emoji_pattern.findall(line)
        if matches:
            # 중복 제거하고 순서 유지
            unique_emojis = []
            for m in matches:
                if m not in unique_emojis:
                    unique_emojis.append(m)
            
            # 라인 길이 초과 시 짤라서 표시
            line_preview = line.rstrip()
            if len(line_preview) > 100:
                line_preview = line_preview[:100] + "..."
            
            results.append({
                'line': line_num,
                'content': line_preview,
                'emojis': unique_emojis,
                'count': len(matches)
            })
    
    return results

files = [
    'src/page-hubs.js',
    'src/page-home.js',
    'src/page-inout.js',
    'src/main.js',
    'src/audit-log.js',
    'src/auth.js',
    'src/excel-templates.js',
    'src/error-monitor.js',
    'src/db.js',
]

for filepath in files:
    result = extract_emojis_from_file(filepath)
    if result is None:
        print(f"{filepath}: 파일 없음")
        continue
    
    if not result:
        print(f"{filepath}: 이모지 없음")
        continue
    
    print(f"\n{'='*70}")
    print(f"파일: {filepath}")
    print(f"이모지 포함 라인: {len(result)}개")
    print(f"{'='*70}")
    
    for item in result[:15]:  # 처음 15개만
        emojis_str = ''.join(item['emojis'])
        print(f"  L{item['line']:4d}: {emojis_str:5s} | {item['content']}")
    
    if len(result) > 15:
        print(f"  ... 외 {len(result) - 15}개 라인")

