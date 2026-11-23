"""Read only string/list opcodes from the official path index; no pickle execution."""
import json, pickletools, re
from pathlib import Path
root=Path(__file__).resolve().parent
paths=[]
for opcode,arg,pos in pickletools.genops((root/'cache/official-paths.pkl').read_bytes()):
    if opcode.name in ('BINUNICODE','SHORT_BINUNICODE','UNICODE','STRING','BINSTRING','SHORT_BINSTRING'):
        if isinstance(arg,bytes): arg=arg.decode('utf-8')
        if re.search(r's\d+/o\d+/C_\d+_\d+_\d+\.png$',arg): paths.append(arg)
if len(paths)!=164866: raise ValueError(f'Unexpected path count {len(paths)}')
groups={}
for i,p in enumerate(paths):
    session,obj,frame=map(int,re.search(r'C_(\d+)_(\d+)_(\d+)\.png$',p).groups())
    groups.setdefault(f'{obj}:{session}',[]).append({'source_row_idx':i,'original_path':p,'frame':frame})
(root/'cache/official-index.json').write_text(json.dumps(groups),encoding='utf-8')
print('Indexed',len(paths),'official paths;',len(groups),'object/session groups; sample:',paths[:2],paths[92450:92452])
