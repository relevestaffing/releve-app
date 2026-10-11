Beonde Elegance — drop the licensed font files in THIS folder.

Expected filenames (exactly these, lowercase):
  beonde-elegance.woff2   (preferred - smaller; convert from the .otf if the
                           purchase only includes .woff, see below)
  beonde-elegance.woff    (included in the Envato/VinType download)

Then make TWO changes in app/globals.css:
  1. Uncomment the @font-face block near the top of the file.
  2. Change the --display token from
         --display:'Marcellus',serif;
     to
         --display:'Beonde Elegance','Marcellus',serif;

And make the identical two changes in the website's own inline stylesheet
(Releve/releve-site-deploy/index.html), or the app and the site stop matching.

Where it will appear (display sizes only, by design - this is a display face
and goes strained below about 20px):
  - console page titles and the greeting      (.topbar h1)
  - section headings                          (.section-title h2)
  - the Signature question                    (.q-text)
  - the website hero headline
Marcellus keeps card headings, stat figures and names; Tenor Sans keeps body.

LICENSE: the free download floating around (befonts, fontspace) is a DEMO,
personal use only, NO commercial use. Releve needs a paid commercial license
that covers WEBFONT / web embedding. Cheapest route found: GraphicRiver
(Envato), $19, includes OTF/TTF/WOFF. Confirm web embedding is covered at
checkout; VinType also sells a Basic Commercial license directly.
