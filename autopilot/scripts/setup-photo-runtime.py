"""Install a free CPU preview runtime into a dedicated directory.

Usage: python3 setup-photo-runtime.py DIRECTORY
Only public release files are downloaded. No hosted speech API is used.
"""
import pathlib
import subprocess
import sys
import tarfile
import urllib.request
import venv

root = pathlib.Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
if not (root / "venv/bin/python").is_file():
    venv.EnvBuilder(with_pip=True, symlinks=True).create(root / "venv")
python = root / "venv/bin/python"
subprocess.run([str(python), "-m", "pip", "install", "fonttools==4.60.1",
    "https://github.com/VOICEVOX/voicevox_core/releases/download/0.17.0/voicevox_core-0.17.0-cp310-abi3-manylinux_2_34_x86_64.whl"], check=True)
downloads = {
    "0.vvm": "https://github.com/VOICEVOX/voicevox_vvm/releases/download/0.16.4/0.vvm",
    "VOICEVOX-model-TERMS.txt": "https://github.com/VOICEVOX/voicevox_vvm/releases/download/0.16.4/TERMS.txt",
    "runtime.tgz": "https://github.com/VOICEVOX/onnxruntime-builder/releases/download/voicevox_onnxruntime-1.23.2/voicevox_onnxruntime-linux-x64-1.23.2.tgz",
    "dict.tgz": "https://github.com/r9y9/open_jtalk/releases/download/v1.11.1/open_jtalk_dic_utf_8-1.11.tar.gz",
    "NotoSansJP.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
    "NotoSansJP-OFL.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/OFL.txt",
}
for name, url in downloads.items():
    path = root / name
    if not path.is_file():
        with urllib.request.urlopen(url, timeout=120) as response:
            temporary = root / (name + ".download")
            temporary.write_bytes(response.read())
            temporary.replace(path)
    if name.endswith(".tgz"):
        with tarfile.open(path) as archive:
            archive.extractall(root, filter="data")
subprocess.run([str(python), "-c",
    "from fontTools.ttLib import TTFont; from fontTools.varLib.instancer import instantiateVariableFont; "
    "import sys; f=TTFont(sys.argv[1]); "
    "instantiateVariableFont(f,{'wght':600},inplace=True).save(sys.argv[1]) if 'fvar' in f else None",
    str(root / "NotoSansJP.ttf")], check=True)
print("CPU photo-preview runtime ready:", root)
