#!/usr/bin/env python3
"""Build the public, credential-free Shortcut using Apple's macOS signer.

Run on macOS: python3 scripts/build-iphone-shortcut.py
Apple receives the public shortcut for signing. No account token is included.
"""
import plistlib
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts/shortcuts/add-ourpool-expense.plist'
OUTPUT = ROOT / 'public/shortcuts/add-ourpool-expense.shortcut'


def main():
    workflow = plistlib.loads(SOURCE.read_bytes())
    actions = workflow['WFWorkflowActions']
    if len(actions) != 2 or actions[0]['WFWorkflowActionIdentifier'] != 'is.workflow.actions.url' or actions[1]['WFWorkflowActionIdentifier'] != 'is.workflow.actions.openurl':
        raise SystemExit('Expected only URL and Open URLs actions; review changes before signing.')
    if actions[0]['WFWorkflowActionParameters']['WFURLActionURL'] != 'https://ourpool.vercel.app/add':
        raise SystemExit('Expected the public OurPool add-expense URL.')
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ourpool-shortcut-') as directory:
        unsigned = Path(directory) / 'Add OurPool Expense.shortcut'
        signed = Path(directory) / 'signed.shortcut'
        unsigned.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
        subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(unsigned), '--output', str(signed)], check=True)
        # Own the distributed copy independently of the signing service's file.
        OUTPUT.write_bytes(signed.read_bytes())
    print(f'Signed {OUTPUT.name} ({OUTPUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
