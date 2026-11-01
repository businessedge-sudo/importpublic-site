// Import Public : programme Ambassadeur Commercial (AC)
// Parcours d'adhésion (présentation, formation, conditions) et espace AC
// (tableau de bord, lien de parrainage, clients, recherche, commandes assistées, commissions).
// Toutes les règles (attribution, commissions, droits) sont appliquées par la base.
window.IP_AC = function (ctx) {
  const { sb, cfg, fcfa, date, esc, waLien, lib, badge, msgErreur, toast, occupe, txtVariante, urlImageCampagne } = window.IA;
  const { etat, vue } = ctx;
  const I = window.ICO;

  const lienParrainage = (code) => `${cfg.urlSite}/?ac=${code}`;
  const lienCampagne = (code, id) => `${cfg.urlSite}/?ac=${code}#/campagne/${id}`;
  const lienConfirmation = (id) => `${cfg.urlSite}/#/commande/${id}`;
  const partageWa = (texte) => 'https://wa.me/?text=' + encodeURIComponent(texte);

  async function copier(texte, quoi) {
    try { await navigator.clipboard.writeText(texte); toast((quoi || 'Lien') + ' copié'); }
    catch { toast('Copie impossible : sélectionnez le texte et copiez-le', 'ko'); }
  }
  async function partager(texte, url) {
    if (navigator.share) {
      try { await navigator.share({ text: texte, url }); return; } catch { /* annulé */ }
    }
    window.open(partageWa(texte + ' ' + url), '_blank', 'noopener');
  }
  const qrSvg = (url) => {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createSvgTag(6, 2).replace(/width="\d+px" height="\d+px"/, 'width="100%" height="100%"');
  };
  const parametres = async () => {
    const { data } = await sb.from('parametres').select('cle,valeur');
    return Object.fromEntries((data || []).map((p) => [p.cle, Number(p.valeur)]));
  };

  // ==================================================================
  // Parcours d'adhésion : #/ambassadeur, /formation, /module/:id, /conditions
  // ==================================================================
  async function vueAmbassadeur(sous, params, m) {
    if (etat.ac && !sous) { location.hash = '#/ac'; return; }
    if (sous === 'formation') return listeFormation('#/ambassadeur');
    if (sous === 'module') return pageModule(Number(m[2]), '#/ambassadeur');
    if (sous === 'conditions') return pageConditions();
    return presentation();
  }

  async function presentation() {
    const p = await parametres();
    vue.innerHTML = `
      <section class="hero-ac">
        <div>
          <p class="sur-titre">Programme facultatif</p>
          <h1>Devenez Ambassadeur Commercial</h1>
          <p>Faites découvrir Import Public autour de vous, aidez les personnes qui ne sont pas à l'aise avec Internet,
            et soyez rémunéré pour chaque client satisfait.</p>
          <a class="btn btn-hero" href="#/ambassadeur/formation">${I.fusee}Commencer</a>
        </div>
      </section>

      <div class="titre-section"><h2>Deux façons d'agir, au choix ou les deux</h2></div>
      <div class="deux-colonnes egales">
        <div class="carte mode-ac"><span class="mode-ico jaune">${I.message}</span><h2>Apporteur de clients</h2>
          <ul class="liste-coches"><li>Partagez les campagnes sur WhatsApp, Facebook, TikTok…</li>
          <li>Partagez votre lien de parrainage personnel</li><li>Présentez Import Public à vos proches</li></ul></div>
        <div class="carte mode-ac"><span class="mode-ico bleu">${I.personnes}</span><h2>Accompagnement des clients</h2>
          <ul class="liste-coches"><li>Aidez à créer un compte et à choisir un produit</li>
          <li>Préparez la commande avec le client, il la confirme</li><li>Expliquez le paiement et le suivi du colis</li></ul></div>
      </div>

      <div class="deux-colonnes egales">
        <div class="carte"><h2>Votre rémunération</h2>
          <table class="tableau-simple"><tbody>
            <tr><td>Nouveau client inscrit avec votre lien, première commande livrée</td><td class="montant">${fcfa(p.commission_acquisition)}</td></tr>
            <tr><td>Commande que vous avez préparée avec un client, livrée</td><td class="montant">${fcfa(p.commission_assistance)}</td></tr>
            <tr><td>Simple inscription, commande non livrée, vos propres achats</td><td class="montant">0 F</td></tr>
          </tbody></table>
          <p class="aide">Payé par Import Public après vérification de la livraison. Jamais deux commissions sur une même commande.</p>
        </div>
        <div class="carte"><h2>Les règles essentielles</h2>
          <ul class="liste-regles">
            <li><b>Les clients appartiennent à Import Public.</b> Vous êtes l'apporteur initial, pas le propriétaire. Tout ambassadeur peut aider tout client.</li>
            <li><b>Jamais d'argent en main.</b> Le client paie toujours lui-même, au numéro marchand d'Import Public.</li>
            <li><b>Toujours l'accord du client.</b> Une commande préparée pour lui n'existe qu'une fois qu'il l'a confirmée.</li>
          </ul></div>
      </div>

      <div class="carte"><h2>Comment devenir ambassadeur</h2>
        <ol class="etapes-paiement">
          <li><b>Suivez la formation</b> : 10 courts modules, à votre rythme.</li>
          <li><b>Lisez et acceptez</b> les conditions de collaboration.</li>
          <li><b>Votre espace s'active</b> avec votre lien de parrainage personnel.</li>
        </ol>
        <a class="btn btn-large" href="#/ambassadeur/formation">Commencer la formation</a>
        <p class="aide">Vous restez client comme avant, avec le même compte. Si vous n'acceptez pas les conditions, rien ne change pour vous.</p>
      </div>`;
  }

  async function chargerFormation() {
    const [mods, prog] = await Promise.all([
      sb.from('formation_modules').select('id,ordre,titre,obligatoire').eq('actif', true).order('ordre'),
      etat.session ? sb.from('formation_progression').select('module_id').eq('profil_id', etat.session.user.id) : Promise.resolve({ data: [] })
    ]);
    if (mods.error) throw mods.error;
    const vus = new Set((prog.data || []).map((x) => x.module_id));
    const requis = mods.data.filter((x) => x.obligatoire);
    return { modules: mods.data, vus, fini: requis.every((x) => vus.has(x.id)), nbVus: requis.filter((x) => vus.has(x.id)).length, nbRequis: requis.length };
  }

  async function listeFormation(base) {
    if (!ctx.exigerCompte()) return;
    const f = await chargerFormation();
    const p = Math.round((100 * f.nbVus) / (f.nbRequis || 1));
    const html = `
      ${base === '#/ambassadeur' ? '<a class="retour" href="#/ambassadeur">← Le programme</a><h1>Formation des ambassadeurs</h1>' : '<h2>Formation et supports</h2>'}
      <div class="carte">
        <div class="progression-formation"><div class="jauge"><div class="jauge-barre" style="width:${p}%"></div></div>
          <b>${f.nbVus}/${f.nbRequis} modules</b></div>
        <div class="grille-lignes">${f.modules.map((x) => `
          <a class="ligne module-ligne${f.vus.has(x.id) ? ' vu' : ''}" href="${base}/module/${x.id}">
            <span class="module-num">${f.vus.has(x.id) ? I.coche : x.ordre}</span>
            <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(x.titre)}</div></div>${I.chevron}</a>`).join('')}</div>
        ${base === '#/ambassadeur' ? `<div class="boutons" style="margin-top:14px">
          ${f.fini ? `<a class="btn btn-large" href="#/ambassadeur/conditions">Lire et accepter les conditions</a>`
            : `<a class="btn btn-large" href="${base}/module/${(f.modules.find((x) => !f.vus.has(x.id)) || f.modules[0]).id}">${f.nbVus ? 'Continuer' : 'Commencer'} la formation</a>`}
        </div>` : ''}
      </div>`;
    if (base === '#/ambassadeur') vue.innerHTML = html; else return html;
  }

  async function pageModule(id, base) {
    if (!ctx.exigerCompte()) return;
    const [{ data: mod, error }, f] = await Promise.all([
      sb.from('formation_modules').select('*').eq('id', id).maybeSingle(),
      chargerFormation()
    ]);
    if (error) throw error;
    if (!mod) { vue.innerHTML = '<div class="carte vide">Module introuvable.</div>'; return; }
    const i = f.modules.findIndex((x) => x.id === id);
    const suivant = f.modules[i + 1];
    const retour = base === '#/ambassadeur' ? '#/ambassadeur/formation' : '#/ac/formation';
    const html = `
      <a class="retour" href="${retour}">← Tous les modules</a>
      <article class="carte module-contenu">
        <p class="sur-titre">Module ${mod.ordre} sur ${f.modules.length}</p>
        <h1>${esc(mod.titre)}</h1>
        <div class="texte-module">${esc(mod.contenu.trim())}</div>
        <div class="boutons"><button class="btn btn-large" id="module-lu">${I.coche}${suivant ? 'J\'ai lu, module suivant' : 'J\'ai lu ce dernier module'}</button></div>
      </article>`;
    if (base === '#/ambassadeur') vue.innerHTML = html; else vue.innerHTML = coquille('formation', html);
    document.getElementById('module-lu').addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
      const { error: e } = await sb.rpc('marquer_module_vu', { p_module: id });
      if (e) { toast(msgErreur(e), 'ko'); return; }
      if (suivant) location.hash = `${base}/module/${suivant.id}`;
      else location.hash = base === '#/ambassadeur' ? '#/ambassadeur/conditions' : '#/ac/formation';
    }));
  }

  async function pageConditions() {
    if (!ctx.exigerCompte()) return;
    const [{ data: cond }, f, adh] = await Promise.all([
      sb.from('conditions_ac').select('*').eq('en_vigueur', true).maybeSingle(),
      chargerFormation(),
      sb.from('adhesions_ac').select('version,accepte_le').eq('profil_id', etat.session.user.id).order('accepte_le', { ascending: false }).limit(1)
    ]);
    if (!cond) { vue.innerHTML = '<div class="carte vide">Les conditions ne sont pas encore publiées.</div>'; return; }
    const derniere = (adh.data || [])[0];
    const dejaAcceptee = etat.ac && derniere && derniere.version === cond.version;
    vue.innerHTML = `
      <a class="retour" href="${etat.ac ? '#/ac' : '#/ambassadeur/formation'}">← Retour</a>
      <h1>Conditions de collaboration</h1>
      <div class="carte">
        <p class="sur-titre">Version ${esc(cond.version)}</p>
        <div class="texte-conditions">${esc(cond.texte.trim())}</div>
        ${dejaAcceptee ? `<div class="alerte alerte-ok">Vous avez accepté cette version le ${date(derniere.accepte_le, true)}.</div>`
          : !f.fini ? `<div class="alerte alerte-alerte">Consultez d'abord tous les modules de formation (${f.nbVus}/${f.nbRequis}).
              <a href="#/ambassadeur/formation">Continuer la formation</a></div>`
          : `<label class="case-acceptation"><input type="checkbox" id="accepte"> J'ai lu et j'accepte les conditions de collaboration (version ${esc(cond.version)}).</label>
             <button class="btn btn-large" id="valider-adhesion" disabled>${etat.ac ? 'Accepter la nouvelle version' : 'Valider mon adhésion'}</button>
             <p class="aide">Si vous n'acceptez pas, vous restez simplement client d'Import Public.</p>`}
      </div>`;
    const caseA = document.getElementById('accepte');
    const bouton = document.getElementById('valider-adhesion');
    if (caseA && bouton) {
      caseA.addEventListener('change', () => { bouton.disabled = !caseA.checked; });
      bouton.addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
        const { error } = await sb.rpc('devenir_ambassadeur', { p_version: cond.version });
        if (error) { toast(msgErreur(error), 'ko'); return; }
        await ctx.chargerProfil();
        toast('Bienvenue parmi les Ambassadeurs Commerciaux !');
        location.hash = '#/ac/lien';
      }));
    }
  }

  // ==================================================================
  // Espace AC : #/ac/<rubrique>
  // ==================================================================
  const RUBRIQUES = [
    ['tableau', 'Tableau de bord', 'grille'], ['lien', 'Votre lien', 'fusee'], ['clients', 'Mes clients', 'personnes'],
    ['recherche', 'Rechercher un client', 'loupe'], ['commandes', 'Commandes assistées', 'panier'],
    ['commissions', 'Mes commissions', 'carte'], ['formation', 'Formation', 'crayon'], ['conditions', 'Conditions', 'bouclier']
  ];

  function coquille(actif, contenu) {
    const a = etat.ac || {};
    return `
      <div class="entete-ac">
        <div><p class="sur-titre">Ambassadeur Commercial</p>
          <h1>${esc(((etat.profil && etat.profil.nom_complet) || '').split(' ')[0] || 'Mon espace')}</h1></div>
        <div class="entete-ac-droite">${badge(a.statut || 'actif')}<span class="code-ac">${esc(a.code || '')}</span></div>
      </div>
      ${a.statut === 'suspendu' ? `<div class="alerte alerte-ko">Votre statut d'ambassadeur est suspendu${a.motif_suspension ? ' : ' + esc(a.motif_suspension) : ''}.
        Vous ne pouvez plus rechercher de clients ni commander pour eux. Contactez Import Public.</div>` : ''}
      <nav class="onglets-ac" aria-label="Espace ambassadeur">${RUBRIQUES.map(([k, l, ico]) =>
        `<a href="#/ac/${k}" class="${k === actif ? 'actif' : ''}">${I[ico] || ''}<span>${l}</span></a>`).join('')}</nav>
      <div class="contenu-ac">${contenu}</div>`;
  }

  async function vueAC(rub, params, m) {
    if (!ctx.exigerCompte()) return;
    if (!etat.ac) await ctx.chargerProfil();
    if (!etat.ac) { location.hash = '#/ambassadeur'; return; }
    const r = rub || 'tableau';
    const pages = { tableau: acTableau, lien: acLien, clients: acClients, recherche: acRecherche, client: acFiche,
                    commander: acCommander, commandes: acCommandes, commissions: acCommissions, formation: acFormation,
                    module: (id) => pageModule(Number(id), '#/ac'), conditions: acConditions };
    return (pages[r] || acTableau)(m[2], params, m);
  }

  // ---------- Tableau de bord ----------
  async function acTableau(_, params) {
    const jours = params.get('p') || '30';
    const fin = new Date();
    const debut = jours === 'tout' ? new Date('2020-01-01') : new Date(Date.now() - Number(jours) * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const { data: t, error } = await sb.rpc('tableau_ac', { p_debut: iso(debut), p_fin: iso(fin) });
    if (error) throw error;
    vue.innerHTML = coquille('tableau', `
      <div class="filtres">${[['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours'], ['tout', 'Depuis le début']].map(([k, l]) =>
        `<button class="${k === jours ? 'actif' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="tuiles">
        <div class="tuile vert"><span class="tuile-ico">${I.personnes}</span><b>${t.clients_apportes}</b><span>Clients apportés (total)</span></div>
        <div class="tuile bleu"><span class="tuile-ico">${I.utilisateur}</span><b>${t.inscrits_periode}</b><span>Nouveaux inscrits sur la période</span></div>
        <div class="tuile violet"><span class="tuile-ico">${I.colis}</span><b>${t.premieres_livrees}</b><span>Premières commandes livrées</span></div>
        <div class="tuile orange"><span class="tuile-ico">${I.panier}</span><b>${t.commandes_assistees}</b><span>Commandes assistées (${t.assistees_periode} sur la période)</span></div>
      </div>
      <div class="tuiles tuiles-argent">
        <div class="tuile jaune"><span class="tuile-ico">${I.horloge}</span><b>${fcfa(t.en_attente)}</b><span>Commissions en attente de livraison</span></div>
        <div class="tuile bleu"><span class="tuile-ico">${I.coche}</span><b>${fcfa(t.validees)}</b><span>Validées, à recevoir</span></div>
        <div class="tuile vert"><span class="tuile-ico">${I.carte}</span><b>${fcfa(t.payees)}</b><span>Déjà payées</span></div>
        <div class="tuile rouge"><span class="tuile-ico">${I.graphique}</span><b>${fcfa(t.gains_periode)}</b><span>Gagné sur la période</span></div>
      </div>
      <div class="boutons">
        <a class="btn" href="#/ac/lien">${I.fusee}Partager mon lien</a>
        <a class="btn btn-second" href="#/ac/recherche">${I.loupe}Aider un client</a>
      </div>
      <p class="aide">Membre depuis le ${date(t.adhere_le)} · conditions ${esc(t.conditions_version)} · ${t.visites} visite(s) de votre lien au total.</p>`);
    vue.querySelectorAll('.filtres button').forEach((b) => b.addEventListener('click', () => { location.hash = '#/ac/tableau?p=' + b.dataset.p; }));
  }

  // ---------- Votre lien de parrainage ----------
  async function acLien() {
    const code = etat.ac.code;
    const url = lienParrainage(code);
    const [{ data: t }, { data: camps }] = await Promise.all([
      sb.rpc('tableau_ac', { p_debut: '2020-01-01', p_fin: new Date().toISOString().slice(0, 10) }),
      sb.from('campagnes').select('id,titre,prix_unitaire,image_url,date_cloture').eq('statut', 'ouverte')
        .gt('date_cloture', new Date().toISOString()).order('date_cloture').limit(20)
    ]);
    const message = 'Achetons en Chine, ensemble ! Commandes groupées livrées à Lomé, paiement T-Money ou Flooz. Inscris-toi ici :';
    vue.innerHTML = coquille('lien', `
      <div class="deux-colonnes"><div class="colonne">
        <div class="carte carte-lien">
          <h2>Votre lien de parrainage</h2>
          <p>Partagez ce lien pour inviter de nouveaux clients</p>
          <div class="lien-copie"><input readonly value="${esc(url)}" aria-label="Votre lien de parrainage" id="champ-lien">
            <button class="btn btn-petit" id="copier-lien">Copier</button></div>
          <div class="boutons">
            <button class="btn btn-wa" id="partager-lien">${I.message}Partager</button>
          </div>
          <p class="aide">Une personne qui clique sur ce lien puis crée son compte dans les 30 jours, sur le même téléphone, vous est rattachée.</p>
        </div>
        <div class="tuiles">
          <div class="tuile bleu"><span class="tuile-ico">${I.fleche}</span><b>${t ? t.visites : 0}</b><span>Visites issues du lien</span></div>
          <div class="tuile vert"><span class="tuile-ico">${I.utilisateur}</span><b>${t ? t.clients_apportes : 0}</b><span>Inscriptions</span></div>
          <div class="tuile orange"><span class="tuile-ico">${I.panier}</span><b>${t ? t.clients_ayant_commande : 0}</b><span>Nouveaux clients ayant commandé</span></div>
        </div>
      </div><div class="colonne">
        <div class="carte qr-carte"><h2>QR code</h2>
          <p class="discret">À faire scanner avec le téléphone de la personne, pour qu'elle crée son compte chez elle.</p>
          <div class="qr">${qrSvg(url)}</div></div>
      </div></div>
      ${camps && camps.length ? `<div class="carte"><h2>Partager une campagne avec votre lien</h2>
        <div class="grille-lignes">${camps.map((c) => `<div class="ligne">
          <div class="vignette" style="background-image:url('${esc(urlImageCampagne(c.image_url))}')"></div>
          <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(c.titre)}</div><small>${fcfa(c.prix_unitaire)}</small></div>
          <button class="btn btn-wa btn-petit" data-partager-camp="${c.id}" data-titre="${esc(c.titre)}" data-prix="${c.prix_unitaire}">Partager</button></div>`).join('')}</div></div>` : ''}`);
    document.getElementById('copier-lien').addEventListener('click', () => copier(url));
    document.getElementById('partager-lien').addEventListener('click', () => partager(message, url));
    vue.querySelectorAll('[data-partager-camp]').forEach((b) => b.addEventListener('click', () =>
      partager(`${b.dataset.titre} à ${fcfa(b.dataset.prix)}, en commande groupée sur Import Public :`, lienCampagne(code, b.dataset.partagerCamp))));
  }

  // ---------- Mes clients (suivi, pas propriété) ----------
  async function acClients() {
    const { data, error } = await sb.rpc('mes_clients_ac');
    if (error) throw error;
    vue.innerHTML = coquille('clients', `
      <div class="alerte alerte-info">Les clients que vous avez apportés. Ils restent clients d'Import Public : d'autres ambassadeurs peuvent aussi les aider,
        sans que cela change votre rattachement.</div>
      <div class="carte grille-lignes">${data.length ? data.map((c) => `
        <a class="ligne" href="#/ac/client/${c.id}">
          <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(c.nom || 'Client')} <small class="discret">${esc(c.reference || '')}</small></div>
            <small>Inscrit le ${date(c.inscrit_le)} · ${c.nb_commandes} commande(s) · dernière activité ${date(c.derniere_activite)}${c.region ? ' · ' + esc(c.region) : ''}</small></div>
          <span class="badge badge-${c.statut === 'Client livré' ? 'ok' : c.statut === 'Inscrit' ? 'neutre' : 'info'}">${esc(c.statut)}</span></a>`).join('')
        : `<p class="discret">Aucun client pour le moment. <a href="#/ac/lien">Partagez votre lien</a> pour inviter vos premiers clients.</p>`}</div>`);
  }

  // ---------- Rechercher un client ----------
  async function acRecherche(_, params) {
    const q = params.get('q') || '';
    vue.innerHTML = coquille('recherche', `
      <form class="carte" id="form-recherche">
        <label for="q">Référence client, numéro WhatsApp ou nom</label>
        <div class="lien-copie"><input id="q" required minlength="3" value="${esc(q)}" placeholder="Ex. : IP7K2M9Q, 90 12 34 56 ou Kossi" autocomplete="off">
          <button class="btn btn-petit">${I.loupe}Chercher</button></div>
        <p class="aide">Vous pouvez aider n'importe quel client d'Import Public. Pour protéger leurs données, seules quelques informations s'affichent,
          5 résultats au maximum, et chaque recherche est enregistrée. Vérifiez toujours l'identité de la personne (demandez-lui sa référence client).</p>
      </form>
      <div id="resultats"></div>`);
    const form = document.getElementById('form-recherche');
    const chercher = async (texte) => {
      const zone = document.getElementById('resultats');
      zone.innerHTML = '<div class="chargement">Recherche…</div>';
      const { data, error } = await sb.rpc('rechercher_client', { p_texte: texte });
      if (error) { zone.innerHTML = `<div class="alerte alerte-ko">${esc(msgErreur(error))}</div>`; return; }
      zone.innerHTML = `<div class="carte grille-lignes">${data.length ? data.map((c) => `
        <a class="ligne" href="#/ac/client/${c.id}">
          <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(c.nom)} <small class="discret">${esc(c.reference || '')}</small></div>
            <small>${esc(c.region || 'Région non renseignée')} · ${esc(c.telephone)}</small></div>
          ${c.est_mon_client ? '<span class="badge badge-ok">Votre client</span>' : ''}${I.chevron}</a>`).join('')
        : `<p class="discret">Aucun client trouvé. S'il n'a pas encore de compte, faites-lui scanner <a href="#/ac/lien">votre QR code</a>.</p>`}</div>`;
    };
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = document.getElementById('q').value.trim();
      history.replaceState(null, '', '#/ac/recherche?q=' + encodeURIComponent(t));
      chercher(t);
    });
    if (q.length >= 3) chercher(q);
  }

  // ---------- Fiche client + choix de la campagne ----------
  async function acFiche(id) {
    const [{ data: f, error }, { data: camps }] = await Promise.all([
      sb.rpc('fiche_client_ac', { p_client: id }),
      sb.from('campagnes').select('id,titre,prix_unitaire,image_url,date_cloture,variantes').eq('statut', 'ouverte')
        .gt('date_cloture', new Date().toISOString()).order('date_cloture').limit(30)
    ]);
    if (error) throw error;
    vue.innerHTML = coquille('recherche', `
      <a class="retour" href="#/ac/recherche">← Rechercher un client</a>
      <div class="deux-colonnes"><div class="colonne">
        <div class="carte">
          <div style="display:flex;justify-content:space-between;gap:10px"><h2>${esc(f.nom)}</h2>${f.est_mon_client ? '<span class="badge badge-ok">Votre client</span>' : ''}</div>
          <dl class="cle-valeur">
            <dt>Référence</dt><dd><b>${esc(f.reference || '—')}</b></dd>
            <dt>Région</dt><dd>${esc(f.region || '—')}</dd>
            <dt>Téléphone</dt><dd>${esc(f.telephone)}</dd>
            <dt>Inscrit le</dt><dd>${date(f.inscrit_le)}</dd>
            <dt>Commandes</dt><dd>${f.nb_commandes}${f.derniere_activite ? ' · dernière le ' + date(f.derniere_activite) : ''}</dd>
          </dl>
          <p class="aide">Avant de commander, vérifiez avec la personne qu'il s'agit bien d'elle (référence ou derniers chiffres de son numéro).</p>
        </div>
      </div><div class="colonne">
        <div class="carte"><h2>Commander pour ce client</h2>
          ${f.est_moi ? '<div class="alerte alerte-info">C\'est votre propre compte : commandez directement depuis la campagne (pas de commission sur vos achats).</div>'
            : etat.ac.statut !== 'actif' ? '<div class="alerte alerte-ko">Statut suspendu.</div>'
            : camps && camps.length ? `<p class="discret">Choisissez la campagne :</p><div class="grille-lignes">${camps.map((c) => `
              <a class="ligne" href="#/ac/commander/${f.id}/${c.id}">
                <div class="vignette" style="background-image:url('${esc(urlImageCampagne(c.image_url))}')"></div>
                <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(c.titre)}</div><small>${fcfa(c.prix_unitaire)}</small></div>${I.chevron}</a>`).join('')}</div>`
            : '<p class="discret">Aucune campagne ouverte pour le moment.</p>'}
        </div>
      </div></div>`);
  }

  // ---------- Formulaire de commande assistée ----------
  async function acCommander(clientId, params, m) {
    const campId = m[3];
    const [{ data: c, error }, points] = await Promise.all([
      sb.from('campagnes').select('*').eq('id', campId).maybeSingle(),
      ctx.chargerPoints()
    ]);
    if (error) throw error;
    if (!c) { vue.innerHTML = coquille('recherche', '<div class="carte vide">Campagne introuvable.</div>'); return; }
    vue.innerHTML = coquille('recherche', `
      <a class="retour" href="#/ac/client/${clientId}">← Fiche client</a>
      <div class="deux-colonnes"><div class="colonne">
        <div class="carte" style="padding:0;overflow:hidden">
          ${c.image_url ? `<img src="${esc(urlImageCampagne(c.image_url))}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover">` : ''}
          <div style="padding:16px"><h2>${esc(c.titre)}</h2>
            <div class="prix">${fcfa(c.prix_unitaire)} <small class="discret">par unité, ${c.type_prix === 'TTC' ? 'tout compris' : 'hors transport'}</small></div>
            <p class="discret">${esc(lib(c.mode_transport))} · clôture le ${date(c.date_cloture, true)}</p></div>
        </div>
      </div><div class="colonne">
        <div class="carte" id="form-assiste">
          <h2>Commande pour le client</h2>
          ${ctx.champsCommande(c, points)}
          <label class="case-acceptation"><input type="checkbox" id="accord"> Le client est avec moi (ou au téléphone) et il est d'accord avec ce produit, cette quantité et ce montant.</label>
          <button class="btn btn-large" id="creer-assiste" disabled>Préparer la commande</button>
          <p class="aide">La commande apparaîtra dans le compte du client « à confirmer ». Il la confirme lui-même, puis paie lui-même au numéro marchand d'Import Public.</p>
        </div>
      </div></div>`);
    const zone = document.getElementById('form-assiste');
    ctx.brancherChamps(zone, c);
    const accord = document.getElementById('accord');
    const bouton = document.getElementById('creer-assiste');
    accord.addEventListener('change', () => { bouton.disabled = !accord.checked; });
    bouton.addEventListener('click', (ev) => {
      const choix = ctx.lireChamps(zone);
      if (choix.manque) { toast('Choisissez : ' + choix.manque, 'ko'); return; }
      occupe(ev.currentTarget, async () => {
        const { data: id, error: e } = await sb.rpc('commander_pour_client', {
          p_client: clientId, p_campagne: c.id, p_quantite: choix.quantite, p_variante: choix.variante, p_point: choix.point
        });
        if (e) { toast(msgErreur(e), 'ko'); return; }
        const lien = lienConfirmation(id);
        const texte = `Bonjour, j'ai préparé votre commande Import Public : ${c.titre} × ${choix.quantite}${txtVariante(choix.variante) ? ' (' + txtVariante(choix.variante) + ')' : ''}, ${fcfa(choix.quantite * c.prix_unitaire)}. Confirmez-la depuis votre compte puis payez au numéro marchand d'Import Public :`;
        vue.querySelector('.contenu-ac').innerHTML = `
          <div class="carte carte-reception">
            <h2>${I.coche}Commande préparée</h2>
            <p>Elle attend maintenant la <b>confirmation du client</b>. Envoyez-lui ce lien : il se connecte à son compte, vérifie et confirme, puis paie lui-même.</p>
            <div class="lien-copie"><input readonly value="${esc(lien)}" aria-label="Lien de confirmation"><button class="btn btn-petit" id="copier-conf">Copier</button></div>
            <div class="boutons"><a class="btn btn-wa" target="_blank" rel="noopener" href="${partageWa(texte + ' ' + lien)}">${I.message}Envoyer sur WhatsApp</a>
              <a class="btn btn-second" href="#/ac/commandes">Mes commandes assistées</a></div>
            <p class="aide">Rappel : ne recevez jamais d'argent du client.</p>
          </div>`;
        document.getElementById('copier-conf').addEventListener('click', () => copier(lien));
      });
    });
  }

  // ---------- Commandes assistées ----------
  async function acCommandes(_, params) {
    const f = params.get('f') || 'toutes';
    const { data, error } = await sb.rpc('commandes_assistees_ac');
    if (error) throw error;
    const filtres = {
      toutes: () => true,
      confirmer: (o) => o.confirmation === 'en_attente_client' && o.statut === 'en_attente_paiement',
      confirmees: (o) => o.confirmation === 'confirmee' && o.statut === 'en_attente_paiement',
      payees: (o) => o.statut === 'payee', livrees: (o) => o.statut === 'livree'
    };
    const liste = data.filter(filtres[f] || filtres.toutes);
    const statutCmd = (o) => (o.confirmation === 'en_attente_client' && o.statut === 'en_attente_paiement' ? 'a_confirmer' : o.statut);
    vue.innerHTML = coquille('commandes', `
      <div class="filtres">${[['toutes', 'Toutes'], ['confirmer', 'À confirmer'], ['confirmees', 'Confirmées, non payées'], ['payees', 'Payées'], ['livrees', 'Livrées']].map(([k, l]) =>
        `<button class="${k === f ? 'actif' : ''}" data-f="${k}">${l} (${data.filter(filtres[k]).length})</button>`).join('')}</div>
      <div class="carte grille-lignes">${liste.length ? liste.map((o) => `
        <div class="ligne">
          <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(o.produit)} × ${o.quantite}</div>
            <small>${esc(o.client)} (${esc(o.reference_client || '')})${txtVariante(o.variante) ? ' · ' + esc(txtVariante(o.variante)) : ''} · ${fcfa(o.montant)} · ${date(o.created_at)}</small>
            ${o.commission != null ? `<small class="ligne-commission">Commission : ${fcfa(o.commission)} · ${esc(lib(o.statut_commission))}</small>` : ''}</div>
          <div class="actions-ligne">${badge(statutCmd(o))}
            ${statutCmd(o) === 'a_confirmer' ? `<button class="btn btn-wa btn-petit" data-relancer="${o.id}" data-produit="${esc(o.produit)}">Relancer</button>` : ''}</div>
        </div>`).join('') : '<p class="discret">Rien ici. <a href="#/ac/recherche">Aider un client</a></p>'}</div>
      <p class="aide">La commission d'assistance n'apparaît qu'une fois la commande payée, et devient payable après la livraison.
        Sur la toute première commande d'un client parrainé, c'est son ambassadeur référent qui reçoit la commission d'acquisition.</p>`);
    vue.querySelectorAll('.filtres button').forEach((b) => b.addEventListener('click', () => { location.hash = '#/ac/commandes?f=' + b.dataset.f; }));
    vue.querySelectorAll('[data-relancer]').forEach((b) => b.addEventListener('click', () =>
      window.open(partageWa(`Bonjour, votre commande Import Public « ${b.dataset.produit} » attend votre confirmation : ${lienConfirmation(b.dataset.relancer)}`), '_blank', 'noopener')));
  }

  // ---------- Mes commissions ----------
  async function acCommissions() {
    const { data, error } = await sb.rpc('mes_commissions_ac');
    if (error) throw error;
    const somme = (s) => data.filter((c) => c.statut === s).reduce((t, c) => t + Number(c.montant), 0);
    vue.innerHTML = coquille('commissions', `
      <div class="tuiles">
        <div class="tuile jaune"><span class="tuile-ico">${I.horloge}</span><b>${fcfa(somme('en_attente'))}</b><span>En attente (livraison à venir)</span></div>
        <div class="tuile bleu"><span class="tuile-ico">${I.coche}</span><b>${fcfa(somme('validee'))}</b><span>Validées, à recevoir</span></div>
        <div class="tuile vert"><span class="tuile-ico">${I.carte}</span><b>${fcfa(somme('payee'))}</b><span>Payées</span></div>
      </div>
      <div class="carte grille-lignes">${data.length ? data.map((c) => `
        <div class="ligne">
          <div style="flex:1;min-width:0"><div class="ligne-titre">${fcfa(c.montant)} · ${esc(lib(c.type))}</div>
            <small>${esc(c.produit)} · ${esc(c.client)} · commande ${esc(c.commande_ref)} · ${date(c.cree_le)}</small>
            ${c.statut === 'payee' ? `<small>Payée le ${date(c.payee_le)}${c.versement_ref ? ' · réf. ' + esc(c.versement_ref) : ''}</small>` : ''}
            ${c.motif ? `<small class="motif">Motif : ${esc(c.motif)}</small>` : ''}</div>
          ${badge(c.statut)}</div>`).join('') : '<p class="discret">Pas encore de commission. Elles apparaissent dès qu\'une commande éligible est payée.</p>'}</div>
      <details class="roles-aide"><summary>Comment sont calculées les commissions ?</summary>
        <ul><li><b>Nouveau client</b> : votre filleul passe sa première commande, payée puis livrée.</li>
        <li><b>Assistance</b> : une commande que vous avez préparée avec un client, confirmée, payée puis livrée.</li>
        <li>Jamais deux commissions sur la même commande, rien sur vos propres achats.</li></ul></details>`);
  }

  async function acFormation() {
    vue.innerHTML = coquille('formation', await listeFormation('#/ac'));
  }

  async function acConditions() {
    const [{ data: cond }, { data: adh }] = await Promise.all([
      sb.from('conditions_ac').select('*').eq('en_vigueur', true).maybeSingle(),
      sb.from('adhesions_ac').select('version,accepte_le').eq('profil_id', etat.session.user.id).order('accepte_le', { ascending: false })
    ]);
    const derniere = (adh || [])[0];
    const aJour = cond && derniere && derniere.version === cond.version;
    vue.innerHTML = coquille('conditions', `
      <div class="carte">
        ${derniere ? `<p>Vous avez accepté la version <b>${esc(derniere.version)}</b> le ${date(derniere.accepte_le, true)}.</p>` : ''}
        ${cond && !aJour ? `<div class="alerte alerte-alerte">Une nouvelle version (${esc(cond.version)}) est en vigueur. <a href="#/ambassadeur/conditions">La lire et l'accepter</a></div>` : ''}
        ${cond ? `<div class="texte-conditions">${esc(cond.texte.trim())}</div>` : ''}
      </div>`);
  }

  return { routes: { ambassadeur: vueAmbassadeur, ac: vueAC } };
};
