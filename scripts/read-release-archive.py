"""Bounded, no-link archive extraction for explicit release preparation only."""
import hashlib
import io
from pathlib import Path, PurePosixPath
import sys
import tarfile

archive, output = map(Path, sys.argv[1:])
if archive.stat().st_size > 128 * 1024 * 1024:
    raise ValueError('Archive too large')
raw = archive.read_bytes()
if Path(str(archive) + '.sha256').read_text().split()[0] != hashlib.sha256(raw).hexdigest():
    raise ValueError('Archive checksum mismatch')
files = {}
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as bundle:
    total = 0
    for entry in bundle:
        name = entry.name
        path = PurePosixPath(name)
        total += entry.size
        if not name or str(path) != name or path.is_absolute() or '\\' in name or '..' in path.parts or not entry.isfile() or name in files or entry.size > 64 * 1024 * 1024 or total > 128 * 1024 * 1024:
            raise ValueError('Unsafe/duplicate/oversized archive member')
        files[name] = bundle.extractfile(entry).read()
# Nothing is extracted until all members pass. Caller owns this private staging dir.
for name, data in files.items():
    destination = output / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
print(hashlib.sha256(raw).hexdigest())
