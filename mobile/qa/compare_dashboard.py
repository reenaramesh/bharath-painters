"""Create a review comparison; never use this image as an app asset."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[2]
out=Path(__file__).parent/'approved-dashboard'
reference=Image.open(root/'design-references/contractor-mobile-design.png').convert('RGB')
reference=reference.crop((43,198,357,987))
reference=reference.resize((390,round(reference.height*390/reference.width)))
actual=Image.open(out/'dashboard-390.png').convert('RGB')
canvas=Image.new('RGB',(804,max(reference.height,actual.height)+40),'#EDF2F8')
draw=ImageDraw.Draw(canvas)
draw.text((8,12),'Approved reference (dashboard crop)',fill='#081A4B')
draw.text((414,12),'Implemented Expo web / 390 CSS px',fill='#081A4B')
canvas.paste(reference,(0,40));canvas.paste(actual,(414,40))
canvas.save(out/'comparison-390.png')
print('Saved dashboard comparison at',out/'comparison-390.png')
