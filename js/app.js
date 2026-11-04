// Import Public : site public (clients)
(function () {
  const { sb, cfg, fcfa, date, joursRestants, esc, normTel, waLien, ETAPES_CAMPAGNE, ETAPES_DEMANDE, nomPays, optionsPays, listeRegions,
          lib, badge, frise, jauge, msgErreur, toast, compresserImage, urlImageCampagne, occupe, txtVariante } = window.IA;

  const vue = document.getElementById('vue');
  const etat = { session: null, profil: null, ac: null, groupeur: null, canal: null, recherche: '', points: null };
  // Alertes du téléphone, cloche et application installable (commun/notifs.js)
  const notifs = window.IP_NOTIFS({ origine: 'site', getSession: () => etat.session, getProfil: () => etat.profil,
    surNotif: (n) => { if (n.lien === '#/messages') majPointMessages(); } });
  const chat = window.IP_CHAT({ equipe: false });

  // ------------------------------------------------------------------
  // Lien de parrainage : https://importpublic.com/?ac=CODE
  // On garde le PREMIER lien cliqué pendant 30 jours (pas de « vol » de dernière minute).
  // Stocké uniquement sur ce téléphone : un code, une date et un identifiant aléatoire.
  // ------------------------------------------------------------------
  const DUREE_PARRAINAGE = 30 * 86400000;
  const memo = {
    lire(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    ecrire(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } }
  };
  function capterParrainage() {
    const p = new URLSearchParams(location.search);
    const code = (p.get('ac') || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
    let visiteur = memo.lire('ip_visiteur');
    if (!visiteur) {
      visiteur = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'v' + Date.now() + Math.random().toString(36).slice(2);
      memo.ecrire('ip_visiteur', visiteur);
    }
    const actuel = memo.lire('ip_parrain');
    if (!actuel || Date.now() - actuel.t > DUREE_PARRAINAGE) memo.ecrire('ip_parrain', { code, t: Date.now() });
    sb.rpc('enregistrer_visite', { p_code: code, p_visiteur: visiteur }).then(() => {}, () => {});
    p.delete('ac');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
  }
  const parrainValide = () => {
    const x = memo.lire('ip_parrain');
    return x && Date.now() - x.t <= DUREE_PARRAINAGE ? x : null;
  };

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  async function demarrer() {
    capterParrainage();
    const { data } = await sb.auth.getSession();
    etat.session = data.session;
    await Promise.all([chargerProfil(), chargerGroupeur()]);
    majEntete();
    brancherRecherche();
    notifs.demarrer();
    majPointMessages();

    // Jamais d'appel Supabase attendu DANS ce rappel (blocage du verrou d'auth) : on diffère.
    sb.auth.onAuthStateChange((evt, session) => {
      etat.session = session;
      if (evt === 'PASSWORD_RECOVERY') { setTimeout(() => { location.hash = '#/reinitialiser'; }, 0); return; }
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') {
        setTimeout(async () => {
          await chargerProfil(); majEntete();
          if (evt !== 'USER_UPDATED') { notifs.demarrer(); majPointMessages(); }
          if (evt === 'SIGNED_OUT') router();
        }, 0);
      }
    });

    window.addEventListener('hashchange', router);
    router();
  }

  async function chargerProfil() {
    etat.profil = null;
    etat.ac = null;
    if (!etat.session) return;
    const uid = etat.session.user.id;
    const [p, a] = await Promise.all([
      sb.from('profils').select('*').eq('id', uid).maybeSingle(),
      sb.from('ambassadeurs').select('*').eq('id', uid).maybeSingle()
    ]);
    etat.profil = p.data;
    etat.ac = a.data || null;
  }

  async function chargerPoints() {
    if (etat.points) return etat.points;
    const { data } = await sb.from('points_retrait').select('id,nom,ville,region,adresse,horaires,principal')
      .eq('actif', true).order('principal', { ascending: false }).order('nom');
    etat.points = data || [];
    return etat.points;
  }

  async function chargerGroupeur() {
    const { data } = await sb.from('groupeurs').select('*').order('created_at').limit(1).maybeSingle();
    etat.groupeur = data;
    const wa = document.getElementById('wa-flottant');
    if (data && data.whatsapp) {
      wa.href = waLien(data.whatsapp, 'Bonjour Import Public, ');
      wa.hidden = false;
      const bc = document.getElementById('bande-contact');
      bc.textContent = 'WhatsApp ' + telLisible(data.whatsapp);
      bc.href = waLien(data.whatsapp, 'Bonjour Import Public, ');
      bc.hidden = false;
    }
  }

  function majEntete() {
    const zone = document.getElementById('entete-compte');
    const I = window.ICO;
    zone.innerHTML = (etat.session ? '<span id="cloche"></span>' : '') + (etat.session
      ? `<a class="lien-compte" href="#/compte">${I.utilisateur}<span>${esc((etat.profil && etat.profil.nom_complet || 'Mon compte').split(' ')[0])}</span>${I.chevron}</a>`
      : `<a class="lien-compte" href="#/compte">${I.utilisateur}<span>Se connecter</span></a>`);
    notifs.dessinerCloche();
  }

  // Pastille « nouveau message » sur l'onglet Messages
  async function majPointMessages() {
    let nouveau = false;
    if (etat.session) {
      const { data } = await sb.from('conversations').select('dernier_msg_le,lu_client_le,dernier_de_equipe')
        .eq('client_id', etat.session.user.id).maybeSingle();
      nouveau = !!(data && data.dernier_de_equipe && new Date(data.dernier_msg_le) > new Date(data.lu_client_le));
    }
    document.querySelectorAll('[data-onglet="messages"]').forEach((a) => {
      let pt = a.querySelector('.point-nouveau');
      if (nouveau && !pt) { pt = document.createElement('span'); pt.className = 'point-nouveau'; pt.setAttribute('aria-label', 'Nouveau message'); a.appendChild(pt); }
      if (!nouveau && pt) pt.remove();
    });
  }

  function brancherRecherche() {
    const f = document.getElementById('recherche-entete');
    const champ = document.getElementById('champ-recherche');
    const appliquer = () => {
      etat.recherche = champ.value;
      if (location.hash.replace(/^#\/?/, '') !== '') { location.hash = '#/'; return; }
      const m = document.getElementById('recherche-mobile'); if (m) m.value = champ.value;
      filtrer();
    };
    champ.addEventListener('input', () => { if (location.hash.replace(/^#\/?/, '') === '') appliquer(); });
    f.addEventListener('submit', (ev) => { ev.preventDefault(); appliquer();
      const o = document.getElementById('offres'); if (o) o.scrollIntoView({ behavior: 'smooth' }); });
  }

  // ------------------------------------------------------------------
  // Routeur (#/chemin/param?cle=valeur)
  // ------------------------------------------------------------------
  function router() {
    if (etat.canal) { sb.removeChannel(etat.canal); etat.canal = null; }
    const brut = location.hash.replace(/^#\/?/, '');
    const [chemin, qs] = brut.split('?');
    const morceaux = chemin.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    const onglet = { '': 'campagnes', campagne: 'campagnes', 'sur-mesure': 'sur-mesure', demande: 'colis',
                     commande: 'colis', colis: 'colis', compte: 'compte', reinitialiser: 'compte',
                     ambassadeur: 'compte', ac: 'compte', messages: 'messages' }[morceaux[0] || ''];
    document.querySelectorAll('.nav-bas a, .nav-haut a').forEach((a) => a.classList.toggle('actif', a.dataset.onglet === onglet));
    // Bouton WhatsApp flottant sur toutes les pages (sauf la messagerie, qui a sa propre zone de saisie)
    const avecWa = !!(etat.groupeur && etat.groupeur.whatsapp) && morceaux[0] !== 'messages';
    document.getElementById('wa-flottant').hidden = !avecWa;
    document.body.classList.toggle('avec-wa', avecWa);
    window.scrollTo(0, 0);

    const routes = {
      '': vueAccueil, campagne: vueCampagne, commande: vueCommande, 'sur-mesure': vueSurMesure,
      demande: vueDemande, colis: vueColis, compte: vueCompte, reinitialiser: vueReinitialiser, messages: vueMessages,
      ...espaceAC.routes
    };
    const f = routes[morceaux[0] || ''] || vueAccueil;
    vue.innerHTML = '<div class="chargement">Chargement…</div>';
    Promise.resolve(f(morceaux[1], params, morceaux)).catch((e) => {
      vue.innerHTML = `<div class="carte"><div class="alerte alerte-ko">${esc(msgErreur(e))}</div>
        <button class="btn btn-second" onclick="location.reload()">Réessayer</button></div>`;
    });
  }

  // Redirige vers la connexion si besoin, puis revient à la page demandée
  function exigerCompte() {
    if (etat.session) return true;
    location.hash = '#/compte?retour=' + encodeURIComponent(location.hash.slice(1) || '/');
    return false;
  }

  // ------------------------------------------------------------------
  // Accueil : campagnes en cours
  // ------------------------------------------------------------------
  async function vueAccueil() {
    const { data, error } = await sb.from('campagnes')
      .select('id,titre,prix_unitaire,prix_reference,type_prix,quota,quantite_payee,nb_clients,date_cloture,mode_transport,statut,image_url')
      .neq('statut', 'brouillon').order('date_cloture', { ascending: true }).limit(60);
    if (error) throw error;

    const ouvertes = data.filter((c) => c.statut === 'ouverte' && new Date(c.date_cloture) > new Date());
    const autres = data.filter((c) => !ouvertes.includes(c) && !['terminee', 'echec_quota'].includes(c.statut));
    const g = etat.groupeur || {};
    const vitrine = ouvertes.filter((c) => c.image_url).slice(0, 4);
    // Badge de la bannière : la plus forte remise RÉELLE (prix habituel renseigné par l'équipe)
    const remiseMax = ouvertes.reduce((m, c) => Math.max(m, remiseDe(c)), 0);
    const I = window.ICO;

    vue.innerHTML = `
      <section class="hero">
        <div class="hero-texte">
          <h1>Achetez ensemble, <span>payez moins.</span></h1>
          <p class="hero-sous-titre"><b>Vos produits préférés commandés en Chine et livrés à Lomé, au prix de gros grâce aux commandes groupées.</b><br>
            Payez avec T-Money ou Flooz et suivez votre colis à chaque étape.</p>
          <div class="boutons">
            <a class="btn btn-hero" href="#offres" id="voir-offres">${I.panier}Découvrir les offres${I.fleche}</a>
            <a class="btn btn-hero-second" href="#/sur-mesure">${I.crayon}Commander un produit sur mesure</a>
          </div>
        </div>
        <div class="hero-scene" aria-hidden="true">
          <svg class="hero-trajet" viewBox="0 0 600 320" preserveAspectRatio="none"><path d="M10 300 C 120 120, 260 60, 420 40" /></svg>
          <span class="hero-avion">${I.avion}</span>
          <div class="hero-podium"></div>
          <div class="hero-produits n${vitrine.length}">${vitrine.map((c) =>
            `<span style="background-image:url('${esc(urlImageCampagne(c.image_url))}')"></span>`).join('')}</div>
          <div class="hero-badge">${remiseMax >= 10 ? `<small>Jusqu'à</small><b>-${remiseMax}%</b>` : `<small>Payez en</small><b>F CFA</b>`}</div>
        </div>
      </section>

      <div class="titre-section" id="offres">
        <h2><span class="ico-titre flamme">${I.flamme}</span>Nos offres en cours</h2>
        <span class="discret">${ouvertes.length} commande${ouvertes.length > 1 ? 's' : ''} groupée${ouvertes.length > 1 ? 's' : ''}</span>
      </div>
      <div class="recherche-mobile"><span>${I.loupe}</span><input id="recherche-mobile" type="search" placeholder="Rechercher un produit…" aria-label="Rechercher un produit"></div>
      ${ouvertes.length ? `<div class="liste-campagnes" id="grille">${ouvertes.map(carteCampagne).join('')}</div>
        <p class="vide" id="aucun-resultat" hidden>Aucun produit ne correspond. <a href="#/sur-mesure">Demandez-le sur mesure</a>.</p>`
        : `<div class="carte vide"><p><b>Aucune commande groupée ouverte pour le moment.</b></p>
           <p>Vous cherchez un produit précis ? Faites une demande sur mesure.</p>
           <a class="btn" href="#/sur-mesure">Demander un produit</a></div>`}

      <section class="bloc-etapes">
        <h2><span class="ico-titre fusee">${I.fusee}</span>Comment ça marche ?</h2>
        <ol class="etapes">
          <li><span class="etape-ico jaune">${I.sac}</span><div><b>Choisissez votre produit</b><span>Réservez une place dans une commande groupée.</span></div></li>
          <li><span class="etape-ico bleu">${I.telephone}</span><div><b>Payez en F CFA</b><span>Utilisez T-Money ou Flooz.</span></div></li>
          <li><span class="etape-ico bleu">${I.avion}</span><div><b>Nous importons votre commande</b><span>Suivez son acheminement.</span></div></li>
          <li><span class="etape-ico brun">${I.colis}</span><div><b>Récupérez votre colis à Lomé</b><span>Recevez une notification WhatsApp.</span></div></li>
        </ol>
      </section>

      <section class="bloc-bas">
        <div class="carte bloc-garanties-carte">
          <h2><span class="ico-titre vert">${I.bouclier}</span>Nos garanties</h2>
          <ul class="garanties">
            <li>${I.coche}Paiement direct à Import Public (T-Money, Flooz)</li>
            <li>${I.coche}Remboursé si le quota n'est pas atteint</li>
            <li>${I.coche}Prix affiché clair, sans frais cachés</li>
            <li>${I.coche}Suivi de commande à chaque étape</li>
          </ul>
        </div>
        <div class="bloc-question">
          <span class="question-ico">${I.casque}</span>
          <div>
            <p class="question-titre">Une question avant de commander&nbsp;?</p>
            <p>Une vraie personne vous répond sur WhatsApp, avant et après votre achat.</p>
            ${g.whatsapp ? `<p class="numero-contact">${esc(telLisible(g.whatsapp))}</p>` : ''}
          </div>
        </div>
        <div class="bloc-alerte">
          <p class="alerte-titre">${I.message}Restez informé des meilleures offres&nbsp;!</p>
          <p>Recevez nos nouvelles commandes groupées directement sur WhatsApp.</p>
          ${g.whatsapp ? `<a class="btn btn-blanc" target="_blank" rel="noopener" href="${waLien(g.whatsapp, 'Bonjour Import Public, je souhaite recevoir vos nouvelles offres sur WhatsApp.')}">Recevoir les offres</a>` : ''}
          <span class="cadeau" aria-hidden="true">${I.colis}</span>
        </div>
      </section>

      ${autres.length ? `<div class="titre-section"><h2>Commandes bouclées, en route vers Lomé</h2></div>
        <div class="carte grille-lignes">${autres.map((c) => `
          <a class="ligne" href="#/campagne/${c.id}">
            <div class="vignette" style="background-image:url('${esc(urlImageCampagne(c.image_url))}')"></div>
            <div style="flex:1"><div class="ligne-titre">${esc(c.titre)}</div><small>${esc(lib(c.mode_transport))}</small></div>
            ${badge(c.statut)}</a>`).join('')}</div>` : ''}`;

    document.getElementById('voir-offres').addEventListener('click', (ev) => {
      ev.preventDefault();
      document.getElementById('offres').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const mobile = document.getElementById('recherche-mobile');
    mobile.value = etat.recherche || '';
    mobile.addEventListener('input', () => { etat.recherche = mobile.value; document.getElementById('champ-recherche').value = mobile.value; filtrer(); });
    filtrer();
  }

  // Filtre la grille selon la recherche (en-tête sur ordinateur, champ dans la page sur téléphone)
  function filtrer() {
    const grille = document.getElementById('grille');
    if (!grille) return;
    const q = (etat.recherche || '').trim().toLowerCase();
    let n = 0;
    grille.querySelectorAll('.campagne').forEach((el) => { const ok = !q || el.dataset.titre.includes(q); el.hidden = !ok; if (ok) n++; });
    const vide = document.getElementById('aucun-resultat');
    if (vide) vide.hidden = n > 0;
  }

  const remiseDe = (c) => (c.prix_reference && c.prix_reference > c.prix_unitaire
    ? Math.round(100 * (1 - c.prix_unitaire / c.prix_reference)) : 0);
  const personnes = (n) => (n > 1 ? `${n} personnes ont réservé !` : n === 1 ? '1 personne a réservé' : 'Soyez le premier à réserver !');
  // +22897715025 -> +228 97 71 50 25
  const telLisible = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 11 && d.startsWith('228') ? '+228 ' + d.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ') : (t || ''); };

  function carteCampagne(c) {
    const I = window.ICO;
    const p = Math.min(100, Math.round((100 * (c.quantite_payee || 0)) / (c.quota || 1)));
    const remise = remiseDe(c);
    return `<article class="campagne" data-titre="${esc(c.titre.toLowerCase())}">
      <a class="campagne-image" href="#/campagne/${c.id}" aria-label="${esc(c.titre)}">
        <img src="${esc(urlImageCampagne(c.image_url))}" alt="" loading="lazy">
        ${remise >= 5 ? `<span class="pastille-remise">-${remise}%</span>` : ''}
        <span class="pastille-delai">${esc(joursRestants(c.date_cloture))}</span></a>
      <div class="campagne-corps">
        <a class="campagne-titre" href="#/campagne/${c.id}">${esc(c.titre)}</a>
        <div class="prix">${fcfa(c.prix_unitaire)}${remise >= 5 ? ` <s class="prix-barre">${fcfa(c.prix_reference)}</s>` : ''}</div>
        <div class="social">${I.personnes}<span>${esc(personnes(c.nb_clients || 0))}</span></div>
        <div class="jauge-ligne"><div class="jauge"><div class="jauge-barre" style="width:${p}%"></div></div><b>${p}%</b></div>
        <a class="btn btn-large btn-reserver" href="#/campagne/${c.id}">${I.panier}Réserver ma part</a>
      </div></article>`;
  }

  // ------------------------------------------------------------------
  // Détail d'une campagne + commande
  // ------------------------------------------------------------------
  async function vueCampagne(id) {
    const { data: c, error } = await sb.from('campagnes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!c) { vue.innerHTML = '<div class="carte vide">Cette campagne n\'existe pas ou n\'est plus visible.</div>'; return; }

    let deja = [];
    if (etat.session) {
      const r = await sb.from('commandes').select('id,quantite,statut,variante,confirmation').eq('campagne_id', id)
        .eq('client_id', etat.session.user.id).neq('statut', 'annulee').order('created_at');
      deja = r.data || [];
    }
    const points = await chargerPoints();
    const ouverte = c.statut === 'ouverte' && new Date(c.date_cloture) > new Date();
    const avecVariantes = (c.variantes || []).length > 0;

    vue.innerHTML = `
      <a class="retour" href="#/">← Campagnes</a>
      <div class="deux-colonnes">
      <div class="colonne">
      <div class="carte" style="padding:0;overflow:hidden">
        ${c.image_url ? `<img src="${esc(urlImageCampagne(c.image_url))}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover">` : ''}
        ${c.description ? `<div style="padding:16px"><h2>Description</h2><p style="white-space:pre-line">${esc(c.description)}</p></div>` : ''}
      </div>
      </div>
      <div class="colonne colonne-collante">
      <div class="carte">
        <div>
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <h1>${esc(c.titre)}</h1>${badge(ouverte ? 'ouverte' : c.statut)}
          </div>
          <div class="prix">${fcfa(c.prix_unitaire)}${c.prix_reference > c.prix_unitaire ? ` <s class="prix-barre">${fcfa(c.prix_reference)}</s>` : ''} <small class="discret">par unité, ${c.type_prix === 'TTC' ? 'livré, tout compris' : 'hors transport'}</small></div>
          <p class="social-detail">${esc(personnes(c.nb_clients || 0))}</p>
          ${c.type_prix === 'HT' && c.frais_transport_unitaire ? `<p class="discret">Transport à régler à l'arrivée : environ ${fcfa(c.frais_transport_unitaire)} par unité.</p>` : ''}
          <div id="zone-jauge" style="margin:12px 0">${jauge(c.quantite_payee, c.quota)}</div>
          <dl class="cle-valeur">
            <dt>Transport</dt><dd>${esc(lib(c.mode_transport))} ${c.mode_transport === 'aerien' ? '(environ 3 semaines)' : '(30 à 45 jours)'}</dd>
            <dt>Clôture</dt><dd>${date(c.date_cloture, true)} · ${esc(joursRestants(c.date_cloture))}</dd>
          </dl>
        </div>
      </div>
      <div id="zone-commande"></div>
      </div>
      </div>`;

    const zone = document.getElementById('zone-commande');
    const listeDeja = deja.length ? `<div class="carte"><h2>Vos réservations</h2>${deja.map((o) => `
        <a class="ligne" href="#/commande/${o.id}"><div style="flex:1;min-width:0"><div class="ligne-titre">${o.quantite} unité(s)${
          txtVariante(o.variante) ? ' · ' + esc(txtVariante(o.variante)) : ''}</div></div>
          ${badge(o.confirmation === 'en_attente_client' ? 'a_confirmer' : o.statut)}</a>`).join('')}</div>` : '';
    if (!ouverte) {
      zone.innerHTML = listeDeja + `<div class="carte"><div class="alerte alerte-info">Cette campagne n'accepte plus de commandes.</div></div>`;
    } else if (deja.length && !avecVariantes) {
      zone.innerHTML = listeDeja;
    } else {
      zone.innerHTML = listeDeja + `<div class="carte" id="form-reserver">
        <h2>${deja.length ? 'Réserver une autre variante' : 'Réserver'}</h2>
        ${champsCommande(c, points)}
        <button class="btn btn-large" id="btn-commander">${etat.session ? 'Réserver et payer' : 'Se connecter pour réserver'}</button>
        <p class="aide" style="margin-top:10px">Si le quota n'est pas atteint à la clôture, vous êtes remboursé.</p>
      </div>`;
      const form = document.getElementById('form-reserver');
      brancherChamps(form, c);
      document.getElementById('btn-commander').addEventListener('click', (ev) => {
        if (!exigerCompte()) return;
        const choix = lireChamps(form);
        if (choix.manque) { toast('Choisissez : ' + choix.manque, 'ko'); return; }
        occupe(ev.currentTarget, async () => {
          const { data, error } = await sb.from('commandes')
            .insert({ campagne_id: c.id, client_id: etat.session.user.id, quantite: choix.quantite, variante: choix.variante, point_id: choix.point })
            .select('id').single();
          if (error) {
            toast(/duplicate|unique/i.test(error.message) ? 'Vous avez déjà réservé cette variante : modifiez la quantité dans votre commande.' : msgErreur(error), 'ko');
            return;
          }
          location.hash = '#/commande/' + data.id;
        });
      });
    }

    // Jauge en temps réel
    etat.canal = sb.channel('campagne-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campagnes', filter: 'id=eq.' + id },
        (p) => { const z = document.getElementById('zone-jauge'); if (z) z.innerHTML = jauge(p.new.quantite_payee, p.new.quota); })
      .subscribe();
  }

  // ------------------------------------------------------------------
  // Champs de commande : variantes (boutons), quantité, point de retrait.
  // Partagés avec « Commander pour un client » (espace Ambassadeur).
  // ------------------------------------------------------------------
  function champsCommande(c, points) {
    const vars = c.variantes || [];
    return `${vars.map((v) => `<div class="groupe-variante"><span class="etiquette">${esc(v.nom)}</span>
        <div class="choix-variante" data-nom="${esc(v.nom)}">${(v.options || []).map((o) =>
          `<button type="button" class="option${v.options.length === 1 ? ' actif' : ''}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
      <label for="qte">Quantité</label>
      <div class="quantite"><button type="button" data-d="-1" aria-label="Moins">−</button>
        <input id="qte" type="number" inputmode="numeric" min="1" value="1"><button type="button" data-d="1" aria-label="Plus">+</button></div>
      ${points.length > 1 ? `<label for="point">Point de retrait</label>
        <select id="point">${points.map((p) => `<option value="${p.id}">${esc(p.nom)}${p.ville ? ' · ' + esc(p.ville) : ''}</option>`).join('')}</select>`
        : points.length === 1 ? `<p class="aide" style="margin-top:10px">Retrait : <b>${esc(points[0].nom)}</b></p>` : ''}
      <div class="total"><span>Total à payer</span><b id="total">${fcfa(c.prix_unitaire)}</b></div>`;
  }
  function brancherChamps(zone, c) {
    const qte = zone.querySelector('#qte');
    const majTotal = () => { zone.querySelector('#total').textContent = fcfa(Math.max(1, parseInt(qte.value, 10) || 1) * c.prix_unitaire); };
    zone.querySelectorAll('.quantite button').forEach((b) => b.addEventListener('click', () => {
      qte.value = Math.max(1, (parseInt(qte.value, 10) || 1) + Number(b.dataset.d)); majTotal();
    }));
    qte.addEventListener('input', majTotal);
    zone.querySelectorAll('.choix-variante').forEach((g) => g.querySelectorAll('.option').forEach((b) =>
      b.addEventListener('click', () => g.querySelectorAll('.option').forEach((x) => x.classList.toggle('actif', x === b)))));
  }
  function lireChamps(zone) {
    const variante = {};
    let manque = null;
    zone.querySelectorAll('.choix-variante').forEach((g) => {
      const s = g.querySelector('.option.actif');
      if (s) variante[g.dataset.nom] = s.dataset.val; else manque = manque || g.dataset.nom;
    });
    const p = zone.querySelector('#point');
    return { variante, manque, quantite: Math.max(1, parseInt(zone.querySelector('#qte').value, 10) || 1),
             point: p ? p.value : ((etat.points && etat.points[0]) || {}).id || null };
  }

  // Suivi détaillé : chaque étape cochée par l'équipe apparaît ici avec sa date
  const ETAPES_CLIENT = [
    ['fournisseur_paye', 'Commande passée et payée au fournisseur'],
    ['production', 'En préparation chez le fournisseur'],
    ['expedie_entrepot', 'Expédiée vers notre entrepôt en Chine'],
    ['recu_entrepot', 'Reçue et contrôlée à notre entrepôt en Chine'],
    ['consolide', 'Prête au départ chez le transitaire'],
    ['depart', 'Partie de Chine'],
    ['arrive_port', 'Arrivée à Lomé (aéroport ou port)'],
    ['dedouanement', 'Dédouanée'],
    ['retire', 'À notre entrepôt de Lomé'],
    ['distribue', 'En route vers votre point de retrait']
  ];
  async function suiviDetaille(o, c, paiements, historique) {
    const [{ data: ops }, { data: cl }] = await Promise.all([
      sb.rpc('suivi_campagne', { p_campagne: c.id }),
      sb.from('colis').select('statut,recu_le,remis_le').eq('commande_id', o.id).maybeSingle()
    ]);
    const auPoint = cl && ['recu', 'remis', 'non_recupere', 'litige'].includes(cl.statut);
    const fait = Object.fromEntries((ops || []).map((x) => [x.etape, x.fait_le]));
    const paye = (paiements || []).find((p) => p.statut === 'confirme');
    const quota = (historique || []).find((h) => h.statut === 'quota_atteint');
    const etapes = [
      ['Paiement validé', paye ? (paye.confirme_le || paye.created_at) : o.updated_at, true],
      ['Quota atteint, commande groupée confirmée', quota && quota.created_at, !!quota || c.statut !== 'ouverte'],
      ...ETAPES_CLIENT.map(([k, l]) => [l, fait[k], !!fait[k]]),
      ['Prêt au retrait', cl && cl.recu_le, auPoint || o.statut === 'livree'],
      ...(o.statut === 'livree' ? [['Colis remis', (cl && cl.remis_le) || o.recu_le, true]] : [])
    ];
    // Une étape plus loin cochée implique les précédentes
    let dernier = -1; etapes.forEach((e, i) => { if (e[2]) dernier = i; });
    return `<ol class="frise">${etapes.map(([l, d], i) => {
      const cl = i <= dernier ? 'fait' : i === dernier + 1 ? 'courant' : 'avenir';
      return `<li class="${cl}"><span class="pastille"></span><div><b>${esc(l)}</b>${d && i <= dernier ? `<small>${date(d, true)}</small>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }

  // Suivi d'une demande sur mesure : devis, paiement, puis les mêmes étapes détaillées que les campagnes
  async function suiviDemandeDetaille(d, historique) {
    const [{ data: ops }, { data: cl }] = await Promise.all([
      sb.rpc('suivi_demande', { p_demande: d.id }),
      sb.from('colis').select('statut,recu_le,remis_le').eq('demande_id', d.id).maybeSingle()
    ]);
    const fait = Object.fromEntries((ops || []).map((x) => [x.etape, x.fait_le]));
    const h = {}; (historique || []).forEach((x) => { if (!h[x.statut]) h[x.statut] = x.created_at; });
    const auPoint = cl && ['recu', 'remis', 'non_recupere', 'litige'].includes(cl.statut);
    const etapes = [
      ['Demande reçue', h.nouvelle || d.created_at, true],
      ['Prix envoyé', h.devis_envoye, !!h.devis_envoye || d.montant_devis != null],
      ['Prix accepté', h.acceptee, !!h.acceptee],
      ['Paiement validé', h.payee, !!h.payee],
      ...ETAPES_CLIENT.map(([k, l]) => [l, fait[k], !!fait[k]]),
      ['Prêt au retrait', cl && cl.recu_le, auPoint || d.statut === 'livree'],
      ...(d.statut === 'livree' ? [['Colis remis', (cl && cl.remis_le) || d.recu_le, true]] : [])
    ];
    let dernier = -1; etapes.forEach((e, i) => { if (e[2]) dernier = i; });
    return `<ol class="frise">${etapes.map(([l, dt], i) => {
      const cls = i <= dernier ? 'fait' : i === dernier + 1 ? 'courant' : 'avenir';
      return `<li class="${cls}"><span class="pastille"></span><div><b>${esc(l)}</b>${dt && i <= dernier ? `<small>${date(dt, true)}</small>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }

  // Colis en point de retrait : où, quand, et le code à présenter
  async function blocColis(filtre) {
    const { data: cl } = await sb.from('colis').select('id,reference,statut,recu_le,remis_le,points_retrait(nom,adresse,ville,horaires,telephone),colis_codes(code)')
      .eq(filtre.col, filtre.val).maybeSingle();
    if (!cl) return null;
    const pt = cl.points_retrait || {};
    const code = (Array.isArray(cl.colis_codes) ? (cl.colis_codes[0] || {}).code : (cl.colis_codes || {}).code) || '';
    const lieu = `<dl class="cle-valeur"><dt>Point de retrait</dt><dd>${esc(pt.nom || '')}</dd>
        ${pt.adresse || pt.ville ? `<dt>Adresse</dt><dd>${esc([pt.adresse, pt.ville].filter(Boolean).join(', '))}</dd>` : ''}
        ${pt.horaires ? `<dt>Horaires</dt><dd>${esc(pt.horaires)}</dd>` : ''}
        <dt>Référence colis</dt><dd><b>${esc(cl.reference)}</b></dd></dl>`;
    const codeHtml = `<div class="code-retrait"><span>Votre code de retrait</span><b>${esc(code.replace(/(\d{3})(\d{3})/, '$1 $2'))}</b>
        <small>Ne le communiquez qu'au point de retrait, au moment de récupérer le colis.</small></div>`;
    if (cl.statut === 'remis') {
      return `<div class="carte carte-reception"><h2>Colis remis</h2><p>Remis le ${date(cl.remis_le, true)}. Merci pour votre confiance&nbsp;!</p></div>`;
    }
    if (cl.statut === 'attendu') {
      return `<div class="carte"><h2>Votre colis arrive au point de retrait</h2>
        <p class="discret">Il est arrivé à Lomé et part vers votre point de retrait. Vous serez prévenu dès qu'il y est.</p>${lieu}${codeHtml}</div>`;
    }
    if (cl.statut === 'non_recupere' || cl.statut === 'litige') {
      const g = etat.groupeur || {};
      return `<div class="carte"><h2>${esc(lib(cl.statut))}</h2>${lieu}${codeHtml}
        ${g.whatsapp ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waLien(g.whatsapp, 'Bonjour Import Public, au sujet de mon colis ' + cl.reference + ' : ')}">Nous écrire sur WhatsApp</a>` : ''}</div>`;
    }
    return `<div class="carte carte-reception"><h2>${window.ICO.coche}Prêt au retrait&nbsp;!</h2>
      <p>Présentez ce code au point de retrait pour récupérer votre colis.</p>${codeHtml}${lieu}</div>`;
  }

  // ------------------------------------------------------------------
  // Bloc de paiement par numéro marchand
  // ------------------------------------------------------------------
  function blocPaiement({ commandeId, demandeId, montant, enVerification, apres }) {
    if (enVerification) {
      return `<div class="alerte alerte-alerte"><b>Paiement en cours de vérification.</b><br>
        Référence ${esc(enVerification.reference_externe)} · ${esc(lib(enVerification.operateur))}. Nous validons sous 24 h maximum.</div>`;
    }
    const g = etat.groupeur || {};
    const numeros = [['tmoney', g.numero_marchand_tmoney], ['flooz', g.numero_marchand_flooz]].filter(([, n]) => n);
    if (!numeros.length) {
      return `<div class="paiement"><b>Paiement</b><p style="margin-top:6px">Le numéro marchand sera affiché ici très bientôt.
        En attendant, écrivez-nous pour payer.</p>
        ${g.whatsapp ? `<a class="btn btn-wa btn-large" target="_blank" rel="noopener" href="${waLien(g.whatsapp, 'Bonjour, je souhaite payer ma commande de ' + fcfa(montant))}">Payer via WhatsApp</a>` : ''}</div>`;
    }
    setTimeout(() => brancherPaiement({ commandeId, demandeId, apres }), 0);
    return `<div class="paiement" id="bloc-paiement">
      <h2>Payer ${fcfa(montant)}</h2>
      <ol class="etapes-paiement">
        <li>Envoyez exactement <b>${fcfa(montant)}</b> au numéro marchand${g.nom_marchand ? ` <b>${esc(g.nom_marchand)}</b>` : ''} :</li>
      </ol>
      ${numeros.map(([op, n]) => `<div class="numero-marchand"><span>${esc(lib(op))}</span><b>${esc(n)}</b>
        <button type="button" class="btn btn-second btn-petit" data-copier="${esc(n)}">Copier</button></div>`).join('')}
      <ol class="etapes-paiement" start="2"><li>Recopiez ci-dessous la référence du SMS de confirmation.</li></ol>
      <form id="form-paiement">
        <label for="op">Opérateur utilisé</label>
        <select id="op" required>${numeros.map(([op]) => `<option value="${op}">${esc(lib(op))}</option>`).join('')}</select>
        <label for="ref">Référence de la transaction</label>
        <input id="ref" required minlength="4" autocomplete="off" placeholder="Ex. : CI251031.1234.A56789">
        <label for="num">Numéro qui a payé</label>
        <input id="num" type="tel" inputmode="tel" placeholder="90 00 00 00" value="${esc(etat.profil && etat.profil.telephone || '')}">
        <button class="btn btn-large" style="margin-top:14px">J'ai payé, envoyer la référence</button>
      </form></div>`;
  }

  function brancherPaiement({ commandeId, demandeId, apres }) {
    const bloc = document.getElementById('bloc-paiement');
    if (!bloc) return;
    bloc.querySelectorAll('[data-copier]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copier.replace(/\s/g, '')); toast('Numéro copié'); }
      catch { toast('Copie impossible, notez le numéro'); }
    }));
    document.getElementById('form-paiement').addEventListener('submit', (ev) => {
      ev.preventDefault();
      occupe(ev.target.querySelector('button[type=submit],button:not([type])'), async () => {
        const { error } = await sb.rpc('declarer_paiement', {
          p_commande: commandeId || null, p_demande: demandeId || null,
          p_operateur: document.getElementById('op').value,
          p_reference: document.getElementById('ref').value,
          p_numero: normTel(document.getElementById('num').value, etat.profil && etat.profil.pays) || null
        });
        if (error) { toast(msgErreur(error), 'ko'); return; }
        toast('Merci ! Nous vérifions votre paiement.');
        apres();
      });
    });
  }

  // ------------------------------------------------------------------
  // Une commande sur campagne : paiement + suivi
  // ------------------------------------------------------------------
  async function vueCommande(id) {
    if (!exigerCompte()) return;
    const { data: o, error } = await sb.from('commandes')
      .select('*, campagnes(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!o) { vue.innerHTML = '<div class="carte vide">Commande introuvable.</div>'; return; }
    const c = o.campagnes;
    const [{ data: paiements }, { data: historique }, colisHtml, points] = await Promise.all([
      sb.from('paiements').select('*').eq('commande_id', id).order('created_at', { ascending: false }),
      sb.from('statuts_expedition').select('statut,created_at').eq('campagne_id', c.id).order('created_at'),
      blocColis({ col: 'commande_id', val: id }),
      chargerPoints()
    ]);
    const enVerif = (paiements || []).find((p) => p.statut === 'initie');
    const rejete = (paiements || []).find((p) => p.statut === 'echoue');
    const aConfirmer = o.confirmation === 'en_attente_client' && o.statut === 'en_attente_paiement';
    const point = points.find((p) => p.id === o.point_id);

    let corps = '';
    if (aConfirmer) {
      corps = `<h2>Commande préparée pour vous</h2>
        <p>Un Ambassadeur Commercial d'Import Public a préparé cette commande avec vous le ${date(o.created_at, true)}.
        Vérifiez le produit, la quantité et le montant ci-dessus.</p>
        <p class="aide">Rien n'est payé tant que vous ne confirmez pas. Vous paierez ensuite vous-même, au numéro marchand d'Import Public.
        Ne remettez jamais d'argent à un ambassadeur.</p>
        <div class="boutons"><button class="btn btn-ok" id="confirmer-cmd">${window.ICO.coche}Je confirme cette commande</button>
          <button class="btn btn-ko" id="refuser-cmd">Ce n'est pas ma commande</button></div>`;
    } else if (o.statut === 'en_attente_paiement') {
      corps = (rejete && !enVerif ? `<div class="alerte alerte-ko">Le paiement avec la référence ${esc(rejete.reference_externe)} n'a pas été retrouvé. Vérifiez la référence ou contactez-nous.</div>` : '')
        + blocPaiement({ commandeId: o.id, montant: o.montant_total, enVerification: enVerif, apres: router });
    } else if (o.statut === 'a_rembourser') {
      corps = `<div class="alerte alerte-ko">La campagne n'a pas atteint son quota. Vous allez être remboursé de ${fcfa(o.montant_total)}.</div>`;
    } else if (o.statut === 'remboursee') {
      corps = `<div class="alerte alerte-info">Vous avez été remboursé de ${fcfa(o.montant_total)}.</div>`;
    } else if (o.statut === 'annulee') {
      corps = `<div class="alerte alerte-info">Cette commande a été annulée.</div>`;
    }

    // Commande non payée : le client peut la modifier ou l'annuler (tant qu'aucun paiement n'est en vérification)
    const modifiable = o.statut === 'en_attente_paiement' && !enVerif && !aConfirmer;
    const campagneOuverte = c.statut === 'ouverte' && new Date(c.date_cloture) > new Date();
    const actions = modifiable ? `<div class="carte">
        <h2>Modifier ma commande</h2>
        <p class="discret">Possible tant que vous n'avez pas payé.</p>
        ${campagneOuverte ? `<label for="qte-mod">Quantité</label>
        <div class="quantite"><button type="button" data-d="-1" aria-label="Moins">−</button>
          <input id="qte-mod" type="number" inputmode="numeric" min="1" value="${o.quantite}"><button type="button" data-d="1" aria-label="Plus">+</button></div>
        <div class="total"><span>Nouveau total</span><b id="total-mod">${fcfa(o.montant_total)}</b></div>` : ''}
        <div class="boutons">
          ${campagneOuverte ? `<button class="btn" id="enregistrer-qte">Enregistrer la quantité</button>` : ''}
          <button class="btn btn-ko" id="annuler-commande">Annuler la commande</button>
        </div>
        <div id="confirmer-annulation"></div>
      </div>` : '';

    // Colis arrivé à Lomé : remise en point de retrait avec code, sinon le client confirme lui-même
    const peutConfirmer = !colisHtml && o.statut === 'payee' && ['arrivee', 'terminee'].includes(c.statut);
    const reception = peutConfirmer ? `<div class="carte carte-reception">
        <h2>Votre colis est arrivé à Lomé</h2>
        <p>Une fois le colis en main, confirmez la réception pour clôturer votre commande.</p>
        <button class="btn btn-large btn-ok" id="confirmer-reception">${window.ICO.coche}J'ai reçu mon colis</button>
      </div>` : o.statut === 'livree' ? `<div class="alerte alerte-ok">${o.recu_le ? 'Réception confirmée le ' + date(o.recu_le, true) + '.' : 'Commande livrée.'} Merci pour votre confiance&nbsp;!</div>` : '';

    // Après paiement : plus de modification en ligne, mais contact direct
    const g = etat.groupeur || {};
    const aide = ['payee', 'livree', 'a_rembourser'].includes(o.statut) && g.whatsapp
      ? `<p class="aide-commande">Un souci avec cette commande ? <a target="_blank" rel="noopener" href="${waLien(g.whatsapp, 'Bonjour Import Public, au sujet de ma commande « ' + c.titre + ' » (' + o.quantite + ' unité(s)) : ')}">Écrivez-nous sur WhatsApp</a>.</p>` : '';

    const suivi = ['payee', 'livree'].includes(o.statut);
    const detail = suivi ? await suiviDetaille(o, c, paiements, historique) : '';
    memo.ecrire('ip_vu_' + o.id, Date.now());
    vue.innerHTML = `
      <a class="retour" href="#/colis">← Mes colis</a>
      <div class="deux-colonnes"><div class="colonne">
      <div class="carte">
        <div style="display:flex;justify-content:space-between;gap:10px"><h1>${esc(c.titre)}</h1>${badge(aConfirmer ? 'a_confirmer' : o.statut)}</div>
        <dl class="cle-valeur">
          ${txtVariante(o.variante) ? `<dt>Variante</dt><dd>${esc(txtVariante(o.variante))}</dd>` : ''}
          <dt>Quantité</dt><dd>${o.quantite}</dd>
          <dt>Montant</dt><dd>${fcfa(o.montant_total)}</dd>
          <dt>Commandé le</dt><dd>${date(o.created_at, true)}</dd>
          <dt>Transport</dt><dd>${esc(lib(c.mode_transport))}</dd>
          ${point ? `<dt>Retrait</dt><dd>${esc(point.nom)}</dd>` : ''}
        </dl>
        <div style="margin-top:12px">${jauge(c.quantite_payee, c.quota)}</div>
      </div>
      ${colisHtml || reception}
      ${corps ? `<div class="carte">${corps}</div>` : ''}
      ${actions}
      ${aide}
      </div><div class="colonne">
      <div class="carte"><h2>Suivi du colis</h2>
        ${suivi ? detail : '<p class="discret">Le suivi démarre dès que votre paiement est validé.</p>'}
      </div></div></div>`;

    if (modifiable) {
      const champ = document.getElementById('qte-mod');
      if (champ) {
        const maj = () => { document.getElementById('total-mod').textContent = fcfa(Math.max(1, parseInt(champ.value, 10) || 1) * c.prix_unitaire); };
        vue.querySelectorAll('.quantite button').forEach((b) => b.addEventListener('click', () => {
          champ.value = Math.max(1, (parseInt(champ.value, 10) || 1) + Number(b.dataset.d)); maj();
        }));
        champ.addEventListener('input', maj);
        document.getElementById('enregistrer-qte').addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
          const { error } = await sb.rpc('modifier_commande', { p_commande: o.id, p_quantite: Math.max(1, parseInt(champ.value, 10) || 1) });
          if (error) { toast(msgErreur(error), 'ko'); return; }
          toast('Commande modifiée'); router();
        }));
      }
      // Annulation en deux temps (pas de boîte de dialogue du navigateur)
      document.getElementById('annuler-commande').addEventListener('click', () => {
        document.getElementById('confirmer-annulation').innerHTML = `<div class="alerte alerte-ko">Annuler définitivement cette commande ?
          <div class="boutons"><button class="btn btn-ko btn-petit" id="oui-annuler">Oui, annuler</button>
          <button class="btn btn-second btn-petit" id="non-annuler">Non, garder</button></div></div>`;
        document.getElementById('non-annuler').addEventListener('click', () => { document.getElementById('confirmer-annulation').innerHTML = ''; });
        document.getElementById('oui-annuler').addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
          const { error } = await sb.rpc('annuler_commande', { p_commande: o.id });
          if (error) { toast(msgErreur(error), 'ko'); return; }
          toast('Commande annulée'); router();
        }));
      });
    }
    const bRec = document.getElementById('confirmer-reception');
    if (bRec) bRec.addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
      const { error } = await sb.rpc('confirmer_reception', { p_commande: o.id, p_demande: null });
      if (error) { toast(msgErreur(error), 'ko'); return; }
      toast('Merci ! Réception confirmée.'); router();
    }));
    const repondre = (accepte) => (ev) => occupe(ev.currentTarget, async () => {
      const { error } = await sb.rpc('confirmer_commande_assistee', { p_commande: o.id, p_accepte: accepte });
      if (error) { toast(msgErreur(error), 'ko'); return; }
      toast(accepte ? 'Commande confirmée. Vous pouvez payer.' : 'Commande refusée et annulée.'); router();
    });
    const bC = document.getElementById('confirmer-cmd'); if (bC) bC.addEventListener('click', repondre(true));
    const bR = document.getElementById('refuser-cmd'); if (bR) bR.addEventListener('click', repondre(false));
  }

  // ------------------------------------------------------------------
  // Demande sur mesure
  // ------------------------------------------------------------------
  function vueSurMesure() {
    vue.innerHTML = `
      <section class="intro">
        <h1>Commande sur mesure</h1>
        <p>Décrivez le produit que vous voulez. Nous le trouvons en Chine et vous envoyons un prix livré à Lomé.</p>
      </section>
      <div class="deux-colonnes"><div class="colonne">
      ${etat.session ? '' : `<div class="alerte alerte-info">Vous devrez vous connecter pour envoyer la demande, afin de recevoir le devis et suivre votre colis.</div>`}
      <form class="carte" id="form-demande">
        <label for="desc">Quel produit cherchez-vous ?</label>
        <textarea id="desc" required minlength="5" maxlength="2000" placeholder="Ex. : casque Bluetooth à réduction de bruit, noir, avec boîte d'origine"></textarea>
        <label for="photo">Photo du produit</label>
        <input id="photo" type="file" accept="image/*">
        <div class="aide">Une capture d'écran suffit. La photo est réduite avant l'envoi.</div>
        <img id="apercu" class="photo-apercu" alt="" hidden>
        <label for="lien">Lien (Alibaba, 1688, Temu, AliExpress…)</label>
        <input id="lien" type="url" inputmode="url" placeholder="https://…">
        <div class="rangee">
          <div><label for="qte-d">Quantité</label><input id="qte-d" type="number" inputmode="numeric" min="1" value="1" required></div>
          <div><label for="budget">Budget (F CFA)</label><input id="budget" type="number" inputmode="numeric" min="0" placeholder="Optionnel"></div>
        </div>
        <label for="transport">Transport souhaité</label>
        <select id="transport"><option value="">Pas de préférence</option><option value="aerien">Aérien (≈ 3 semaines, plus cher)</option>
          <option value="maritime">Maritime (30 à 45 jours, moins cher)</option></select>
        <button class="btn btn-large" style="margin-top:16px">Envoyer ma demande</button>
      </form>
      </div><div class="colonne colonne-collante">
        <div class="carte"><h2>Comment ça marche</h2>
          <ol class="etapes-paiement">
            <li><b>Vous décrivez le produit</b>, avec une photo ou un lien.</li>
            <li><b>Nous trouvons le fournisseur</b> et vous envoyons un prix livré à Lomé, en général sous 48 h.</li>
            <li><b>Vous acceptez et payez</b> par T-Money ou Flooz.</li>
            <li><b>Vous suivez votre colis</b> ici, jusqu'au retrait.</li>
          </ol></div>
      </div></div>`;

    const photo = document.getElementById('photo');
    photo.addEventListener('change', () => {
      const f = photo.files[0];
      const img = document.getElementById('apercu');
      if (f) { img.src = URL.createObjectURL(f); img.hidden = false; } else img.hidden = true;
    });

    document.getElementById('form-demande').addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!exigerCompte()) return;
      occupe(ev.target.querySelector('button'), async () => {
        const uid = etat.session.user.id;
        let photo_path = null;
        if (photo.files[0]) {
          const blob = await compresserImage(photo.files[0]);
          photo_path = `${uid}/${Date.now()}.jpg`;
          const up = await sb.storage.from('demandes').upload(photo_path, blob, { contentType: 'image/jpeg' });
          if (up.error) { toast(msgErreur(up.error), 'ko'); return; }
        }
        const budget = document.getElementById('budget').value;
        const { data, error } = await sb.from('demandes').insert({
          client_id: uid,
          description: document.getElementById('desc').value.trim(),
          lien: document.getElementById('lien').value.trim() || null,
          quantite: Math.max(1, parseInt(document.getElementById('qte-d').value, 10) || 1),
          budget: budget ? parseInt(budget, 10) : null,
          mode_transport: document.getElementById('transport').value || null,
          photo_path
        }).select('id').single();
        if (error) { toast(msgErreur(error), 'ko'); return; }
        toast('Demande envoyée ! Nous revenons vers vous avec un prix.');
        location.hash = '#/demande/' + data.id;
      });
    });
  }

  async function vueDemande(id) {
    if (!exigerCompte()) return;
    const { data: d, error } = await sb.from('demandes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!d) { vue.innerHTML = '<div class="carte vide">Demande introuvable.</div>'; return; }
    const [{ data: historique }, { data: paiements }, photoUrl, colisHtml] = await Promise.all([
      sb.from('historique_demandes').select('statut,created_at').eq('demande_id', id).order('created_at'),
      sb.from('paiements').select('*').eq('demande_id', id).order('created_at', { ascending: false }),
      d.photo_path ? sb.storage.from('demandes').createSignedUrl(d.photo_path, 3600).then((r) => r.data && r.data.signedUrl) : null,
      blocColis({ col: 'demande_id', val: id })
    ]);
    const enVerif = (paiements || []).find((p) => p.statut === 'initie');
    const rejete = (paiements || []).find((p) => p.statut === 'echoue');
    const suiviD = await suiviDemandeDetaille(d, historique);
    memo.ecrire('ip_vu_d_' + d.id, Date.now());

    let action = '';
    if (d.statut === 'nouvelle') {
      action = `<div class="alerte alerte-info">Nous étudions votre demande. Vous recevrez un prix ici, en général sous 48 h.</div>`;
    } else if (d.statut === 'devis_envoye') {
      action = `<h2>Notre proposition</h2>
        <div class="total" style="border:0;margin:0"><span>Prix total livré à Lomé</span><b>${fcfa(d.montant_devis)}</b></div>
        ${d.note_devis ? `<p style="white-space:pre-line">${esc(d.note_devis)}</p>` : ''}
        <div class="boutons"><button class="btn btn-ok" id="accepter">Accepter</button><button class="btn btn-ko" id="refuser">Refuser</button></div>`;
    } else if (d.statut === 'acceptee') {
      action = (rejete && !enVerif ? `<div class="alerte alerte-ko">Le paiement avec la référence ${esc(rejete.reference_externe)} n'a pas été retrouvé.</div>` : '')
        + blocPaiement({ demandeId: d.id, montant: d.montant_devis, enVerification: enVerif, apres: router });
    } else if (d.statut === 'arrivee' && colisHtml) {
      action = '';
    } else if (d.statut === 'arrivee') {
      action = `<h2>Votre colis est arrivé à Lomé</h2><p>Une fois le colis en main, confirmez la réception.</p>
        <button class="btn btn-large btn-ok" id="confirmer-reception">${window.ICO.coche}J'ai reçu mon colis</button>`;
    } else if (d.statut === 'livree') {
      action = `<div class="alerte alerte-ok">${d.recu_le ? 'Réception confirmée le ' + date(d.recu_le, true) + '.' : 'Commande livrée.'} Merci pour votre confiance&nbsp;!</div>`;
    } else if (d.statut === 'refusee') {
      action = `<div class="alerte alerte-info">Vous avez refusé ce devis. Une autre idée ? <a href="#/sur-mesure">Nouvelle demande</a></div>`;
    } else if (d.statut === 'annulee') {
      action = `<div class="alerte alerte-info">Cette demande a été annulée.</div>`;
    }

    // Avant paiement : modifier (si pas encore chiffrée) ou annuler
    const g = etat.groupeur || {};
    const annulable = ['nouvelle', 'devis_envoye', 'acceptee'].includes(d.statut) && !enVerif;
    const gestionDemande = annulable ? `<div class="carte">
        <h2>Gérer ma demande</h2>
        ${d.statut === 'nouvelle' ? `<form id="form-modif-demande" hidden>
            <label for="md-desc">Description</label><textarea id="md-desc" required minlength="5" maxlength="2000">${esc(d.description)}</textarea>
            <label for="md-lien">Lien</label><input id="md-lien" type="url" value="${esc(d.lien || '')}">
            <div class="rangee"><div><label for="md-qte">Quantité</label><input id="md-qte" type="number" min="1" value="${d.quantite}"></div>
              <div><label for="md-budget">Budget (F CFA)</label><input id="md-budget" type="number" min="0" value="${esc(d.budget || '')}"></div></div>
            <div class="boutons"><button class="btn">Enregistrer</button><button type="button" class="btn btn-second" id="md-fermer">Fermer</button></div>
          </form>` : '<p class="discret">Nous avons déjà chiffré votre demande : pour la modifier, écrivez-nous.</p>'}
        <div class="boutons" id="boutons-demande">
          ${d.statut === 'nouvelle' ? '<button class="btn btn-second" id="md-ouvrir">Modifier ma demande</button>' : ''}
          <button class="btn btn-ko" id="annuler-demande">Annuler la demande</button>
        </div>
        <div id="confirmer-annulation"></div>
      </div>`
      : ['payee', 'commandee', 'entrepot_chine', 'en_transit', 'arrivee'].includes(d.statut) && g.whatsapp
        ? `<p class="aide-commande">Un souci avec cette demande ? <a target="_blank" rel="noopener" href="${waLien(g.whatsapp, 'Bonjour Import Public, au sujet de ma demande sur mesure : ')}">Écrivez-nous sur WhatsApp</a>.</p>` : '';

    vue.innerHTML = `
      <a class="retour" href="#/colis">← Mes colis</a>
      <div class="deux-colonnes"><div class="colonne">
      <div class="carte">
        <div style="display:flex;justify-content:space-between;gap:10px"><h1>Demande sur mesure</h1>${badge(d.statut)}</div>
        <p style="white-space:pre-line">${esc(d.description)}</p>
        ${photoUrl ? `<img class="photo-apercu" src="${esc(photoUrl)}" alt="Photo envoyée">` : ''}
        <dl class="cle-valeur" style="margin-top:12px">
          <dt>Quantité</dt><dd>${d.quantite}</dd>
          ${d.budget ? `<dt>Votre budget</dt><dd>${fcfa(d.budget)}</dd>` : ''}
          ${d.lien ? `<dt>Lien</dt><dd><a href="${esc(d.lien)}" target="_blank" rel="noopener">Ouvrir</a></dd>` : ''}
          <dt>Envoyée le</dt><dd>${date(d.created_at, true)}</dd>
        </dl>
      </div>
      </div><div class="colonne">
      ${colisHtml || ''}
      ${action ? `<div class="carte">${action}</div>` : ''}
      ${gestionDemande}
      <div class="carte"><h2>Suivi</h2>${['refusee', 'annulee'].includes(d.statut) ? '<p class="discret">—</p>' : suiviD}</div>
      </div></div>`;
    brancherGestionDemande(d);
    const bRec = document.getElementById('confirmer-reception');
    if (bRec) bRec.addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
      const { error } = await sb.rpc('confirmer_reception', { p_commande: null, p_demande: d.id });
      if (error) { toast(msgErreur(error), 'ko'); return; }
      toast('Merci ! Réception confirmée.'); router();
    }));

    const rep = (accepte) => (ev) => occupe(ev.currentTarget, async () => {
      const { error } = await sb.rpc('repondre_devis', { p_demande: d.id, p_accepte: accepte });
      if (error) { toast(msgErreur(error), 'ko'); return; }
      router();
    });
    const a = document.getElementById('accepter'); if (a) a.addEventListener('click', rep(true));
    const r = document.getElementById('refuser'); if (r) r.addEventListener('click', rep(false));
  }

  function brancherGestionDemande(d) {
    const ouvrir = document.getElementById('md-ouvrir');
    const form = document.getElementById('form-modif-demande');
    if (ouvrir && form) {
      ouvrir.addEventListener('click', () => { form.hidden = false; document.getElementById('boutons-demande').hidden = true; });
      document.getElementById('md-fermer').addEventListener('click', () => { form.hidden = true; document.getElementById('boutons-demande').hidden = false; });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        occupe(form.querySelector('button'), async () => {
          const b = document.getElementById('md-budget').value;
          const { error } = await sb.rpc('modifier_demande', {
            p_demande: d.id, p_description: document.getElementById('md-desc').value,
            p_quantite: parseInt(document.getElementById('md-qte').value, 10) || 1,
            p_budget: b ? parseInt(b, 10) : null, p_lien: document.getElementById('md-lien').value
          });
          if (error) { toast(msgErreur(error), 'ko'); return; }
          toast('Demande modifiée'); router();
        });
      });
    }
    const annuler = document.getElementById('annuler-demande');
    if (annuler) annuler.addEventListener('click', () => {
      const zone = document.getElementById('confirmer-annulation');
      zone.innerHTML = `<div class="alerte alerte-ko">Annuler définitivement cette demande ?
        <div class="boutons"><button class="btn btn-ko btn-petit" id="oui-annuler">Oui, annuler</button>
        <button class="btn btn-second btn-petit" id="non-annuler">Non, garder</button></div></div>`;
      document.getElementById('non-annuler').addEventListener('click', () => { zone.innerHTML = ''; });
      document.getElementById('oui-annuler').addEventListener('click', (ev) => occupe(ev.currentTarget, async () => {
        const { error } = await sb.rpc('annuler_demande', { p_demande: d.id });
        if (error) { toast(msgErreur(error), 'ko'); return; }
        toast('Demande annulée'); router();
      }));
    });
  }

  // ------------------------------------------------------------------
  // Mes colis
  // ------------------------------------------------------------------
  async function vueColis() {
    if (!exigerCompte()) return;
    const uid = etat.session.user.id;
    const [co, de] = await Promise.all([
      sb.from('commandes').select('id,campagne_id,quantite,montant_total,statut,confirmation,variante,created_at,campagnes(titre,statut,image_url),colis(statut)')
        .eq('client_id', uid).order('created_at', { ascending: false }),
      sb.from('demandes').select('id,description,statut,montant_devis,created_at').eq('client_id', uid).order('created_at', { ascending: false })
    ]);
    if (co.error) throw co.error;
    if (de.error) throw de.error;

    // Statut le plus parlant pour le client : à confirmer, colis au point, ou étape de la campagne une fois payé
    const colisDe = (o) => (Array.isArray(o.colis) ? o.colis[0] : o.colis);
    const statutAffiche = (o) => {
      if (o.confirmation === 'en_attente_client' && o.statut === 'en_attente_paiement') return 'a_confirmer';
      const cl = colisDe(o);
      if (o.statut === 'payee' && cl) return cl.statut;
      return o.statut === 'payee' ? o.campagnes.statut : o.statut;
    };
    const aConfirmer = co.data.filter((o) => statutAffiche(o) === 'a_confirmer').length;
    // Pastille « Mis à jour » : une étape a été cochée depuis la dernière consultation de la commande
    const campagnesSuivies = [...new Set(co.data.filter((o) => ['payee', 'livree'].includes(o.statut)).map((o) => o.campagne_id))];
    const derniere = {};
    await Promise.all(campagnesSuivies.map(async (cid) => {
      const { data } = await sb.rpc('suivi_campagne', { p_campagne: cid });
      const t = (data || []).reduce((m, x) => Math.max(m, new Date(x.fait_le).getTime()), 0);
      derniere[cid] = t;
    }));
    const misAJour = (o) => derniere[o.campagne_id] && derniere[o.campagne_id] > (memo.lire('ip_vu_' + o.id) || 0);

    vue.innerHTML = `
      <h1>Mes colis</h1>
      ${aConfirmer ? `<div class="alerte alerte-alerte">${aConfirmer} commande${aConfirmer > 1 ? 's' : ''} préparée${aConfirmer > 1 ? 's' : ''} par un ambassadeur attend${aConfirmer > 1 ? 'ent' : ''} votre confirmation.</div>` : ''}
      <div class="deux-colonnes egales"><div class="carte"><h2>Commandes groupées</h2>
        ${co.data.length ? co.data.map((o) => `
          <a class="ligne" href="#/commande/${o.id}">
            <div class="vignette" style="background-image:url('${esc(urlImageCampagne(o.campagnes.image_url))}')"></div>
            <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(o.campagnes.titre)}</div>
              <small>${o.quantite} unité(s)${txtVariante(o.variante) ? ' · ' + esc(txtVariante(o.variante)) : ''} · ${fcfa(o.montant_total)}</small></div>
            ${misAJour(o) ? '<span class="pastille-maj">Mis à jour</span>' : ''}${badge(statutAffiche(o))}</a>`).join('')
          : '<p class="discret">Aucune commande pour le moment. <a href="#/">Voir les campagnes</a></p>'}
      </div>
      <div class="carte"><h2>Demandes sur mesure</h2>
        ${de.data.length ? de.data.map((d) => `
          <a class="ligne" href="#/demande/${d.id}">
            <div style="flex:1;min-width:0"><div class="ligne-titre" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.description)}</div>
              <small>${date(d.created_at)}${d.montant_devis ? ' · ' + fcfa(d.montant_devis) : ''}</small></div>
            ${badge(d.statut)}</a>`).join('')
          : '<p class="discret">Aucune demande. <a href="#/sur-mesure">Faire une demande</a></p>'}
      </div></div>`;
  }

  // ------------------------------------------------------------------
  // Messages : discussion directe avec l'équipe
  // ------------------------------------------------------------------
  async function vueMessages() {
    if (!exigerCompte()) return;
    const g = etat.groupeur || {};
    vue.innerHTML = `
      <div class="chat-entete"><div><h1>Discuter avec nous</h1>
        <p class="discret" style="margin:0">Une question sur une commande, un produit, un paiement ? L'équipe vous répond ici, en général dans la journée.</p></div>
        ${g.whatsapp ? `<a class="btn btn-second btn-petit" href="tel:${esc(g.whatsapp)}">${window.ICO.telephone}Appeler</a>` : ''}</div>
      <div id="zone-chat"></div>`;
    etat.canal = await chat.monter(document.getElementById('zone-chat'), etat.session.user.id, etat.session.user.id, {
      vide: `<p><b>Écrivez-nous</b></p><p>Envoyez un texte, une photo du produit recherché ou un document. Pas de messages vocaux : pour parler de vive voix, appelez-nous.</p>` });
    majPointMessages();
  }

  // ------------------------------------------------------------------
  // Compte : connexion, inscription, profil
  // ------------------------------------------------------------------
  function vueCompte(_, params) {
    const retour = params.get('retour');
    const allerApres = () => { location.hash = '#' + (retour || '/colis'); };

    if (etat.session) {
      const p = etat.profil || {};
      const I = window.ICO;
      const carteAC = etat.ac
        ? `<a class="carte carte-ac" href="#/ac"><span class="carte-ac-ico">${I.personnes}</span>
             <div><b>Espace Ambassadeur Commercial</b><span>${etat.ac.statut === 'actif' ? 'Votre lien, vos clients, vos commissions' : 'Statut suspendu'}</span></div>${I.fleche}</a>`
        : `<a class="carte carte-ac" href="#/ambassadeur"><span class="carte-ac-ico">${I.personnes}</span>
             <div><b>Devenir Ambassadeur Commercial</b><span>Facultatif · Faites connaître Import Public, aidez vos proches et gagnez des commissions</span></div>${I.fleche}</a>`;
      vue.innerHTML = `
        <h1>Mon compte</h1>
        ${!p.telephone ? `<div class="alerte alerte-alerte"><b>Dernière étape : votre numéro WhatsApp.</b>
          C'est sur ce numéro que nous vous prévenons à chaque étape de votre commande.</div>` : ''}
        <div class="deux-colonnes"><div class="colonne">
        <div class="carte reference-client"><span>Votre référence client</span><b>${esc(p.reference || '—')}</b>
          <small>Communiquez-la à un ambassadeur ou à notre équipe pour être retrouvé rapidement.</small></div>
        ${carteAC}
        <div data-zone-notifs id="zone-alertes"></div>
        </div><div class="colonne">
        <form class="carte" id="form-profil">
          <label for="p-nom">Nom complet</label><input id="p-nom" required value="${esc(p.nom_complet || '')}">
          <label for="p-tel">Numéro WhatsApp</label><input id="p-tel" type="tel" inputmode="tel" required value="${esc(p.telephone || '')}">
          <div class="rangee">
            <div><label for="p-pays">Pays</label><select id="p-pays">${optionsPays(p.pays)}</select></div>
            <div><label for="p-region">Région</label><input id="p-region" list="p-regions" value="${esc(p.region || '')}" placeholder="Ex. : Grand Lomé">
              <datalist id="p-regions">${listeRegions(p.pays || 'TG')}</datalist></div>
          </div>
          <div class="aide">Nous en avons besoin pour savoir où acheminer vos colis.</div>
          <label>Email</label><input value="${esc(etat.session.user.email || '')}" disabled>
          <button class="btn btn-large" style="margin-top:14px">Enregistrer</button>
        </form>
        <button class="btn btn-second btn-large" id="deconnexion">Se déconnecter</button>
        </div></div>`;
      document.getElementById('form-profil').addEventListener('submit', (ev) => {
        ev.preventDefault();
        occupe(ev.target.querySelector('button'), async () => {
          const { error } = await sb.from('profils').update({
            nom_complet: document.getElementById('p-nom').value.trim(),
            telephone: normTel(document.getElementById('p-tel').value, document.getElementById('p-pays').value),
            pays: document.getElementById('p-pays').value,
            region: document.getElementById('p-region').value.trim() || null
          }).eq('id', etat.session.user.id);
          if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Ce numéro est déjà utilisé par un autre compte.' : msgErreur(error), 'ko'); return; }
          const etaitIncomplet = !p.telephone;
          await chargerProfil(); majEntete(); toast('Enregistré');
          if (etaitIncomplet && etat.profil && etat.profil.telephone) location.hash = '#' + (retour || '/');
        });
      });
      const za = document.getElementById('zone-alertes');
      notifs.remplirCarte(za).then(() => { if (params.get('alertes')) za.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      document.getElementById('p-pays').addEventListener('change', (e) => {
        document.getElementById('p-regions').innerHTML = listeRegions(e.target.value);
      });
      document.getElementById('deconnexion').addEventListener('click', async () => {
        try { await sb.auth.signOut(); } finally {
          // Ceinture et bretelles : on repart d'une page propre
          location.hash = '#/'; location.reload();
        }
      });
      return;
    }

    vue.innerHTML = `
      <div class="deux-colonnes"><div class="colonne">
      <h1>Bienvenue</h1>
      <p class="discret">Un compte vous permet de commander, de recevoir nos prix et de suivre vos colis.</p>
      <div class="onglets"><button data-t="connexion" class="actif">Connexion</button><button data-t="inscription">Créer un compte</button></div>
      <form class="carte" id="form-connexion">
        <label for="c-email">Email</label><input id="c-email" type="email" inputmode="email" autocomplete="email" required>
        <label for="c-mdp">Mot de passe</label><input id="c-mdp" type="password" autocomplete="current-password" required>
        <button class="btn btn-large" style="margin-top:14px">Se connecter</button>
        <p style="margin-top:12px"><button type="button" class="btn btn-lien" id="oubli">Mot de passe oublié ?</button></p>
      </form>
      <form class="carte" id="form-inscription" hidden>
        ${parrainValide() ? `<div class="alerte alerte-info" id="bandeau-invitation">Vous avez été invité par un Ambassadeur Commercial d'Import Public.
          Il sera enregistré comme la personne qui vous a fait découvrir Import Public (cela ne change rien pour vous).
          <button type="button" class="btn btn-lien" id="retirer-invitation">Ne pas l'associer</button></div>` : ''}
        <label for="i-nom">Nom complet</label><input id="i-nom" autocomplete="name" required>
        <div class="rangee">
          <div><label for="i-pays">Pays</label><select id="i-pays" autocomplete="country">${optionsPays('TG')}</select></div>
          <div><label for="i-region">Région</label><input id="i-region" list="i-regions" placeholder="Ex. : Grand Lomé" required>
            <datalist id="i-regions">${listeRegions('TG')}</datalist></div>
        </div>
        <label for="i-tel">Numéro WhatsApp</label><input id="i-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="90 00 00 00" required>
        <div class="aide">C'est sur ce numéro que nous vous prévenons à chaque étape.</div>
        <label for="i-email">Email</label><input id="i-email" type="email" inputmode="email" autocomplete="email" required>
        <label for="i-mdp">Mot de passe</label><input id="i-mdp" type="password" autocomplete="new-password" minlength="6" required>
        <div class="aide">6 caractères minimum.</div>
        <button class="btn btn-large" style="margin-top:14px">Créer mon compte</button>
      </form>
      <div id="message-compte"></div>
      </div><div class="colonne colonne-collante">
        <div class="carte"><h2>Avec votre compte</h2>
          <ul class="liste-coches"><li>Réservez votre part des campagnes en cours</li><li>Recevez nos prix pour vos demandes sur mesure</li>
          <li>Suivez chaque colis, de la Chine jusqu'à Lomé</li><li>Retrouvez l'historique de vos paiements</li></ul></div>
      </div></div>`;

    const message = (html, ton) => { document.getElementById('message-compte').innerHTML = `<div class="alerte alerte-${ton}">${html}</div>`; };
    document.querySelectorAll('.onglets button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.onglets button').forEach((x) => x.classList.toggle('actif', x === b));
      document.getElementById('form-connexion').hidden = b.dataset.t !== 'connexion';
      document.getElementById('form-inscription').hidden = b.dataset.t !== 'inscription';
      document.getElementById('message-compte').innerHTML = '';
    }));

    const retirer = document.getElementById('retirer-invitation');
    if (retirer) retirer.addEventListener('click', () => {
      memo.ecrire('ip_parrain', null);
      document.getElementById('bandeau-invitation').remove();
      toast('Invitation retirée');
    });
    // Arrivée par un lien d'ambassadeur : on propose directement la création de compte
    if (parrainValide() && params.get('inscription') !== '0') {
      const b = document.querySelector('.onglets button[data-t="inscription"]');
      if (b && !retour) setTimeout(() => b.click(), 0);
    }

    document.getElementById('i-pays').addEventListener('change', (e) => {
      document.getElementById('i-regions').innerHTML = listeRegions(e.target.value);
      document.getElementById('i-region').value = '';
    });

    document.getElementById('form-connexion').addEventListener('submit', (ev) => {
      ev.preventDefault();
      occupe(ev.target.querySelector('button:not([type=button])'), async () => {
        const { error } = await sb.auth.signInWithPassword({
          email: document.getElementById('c-email').value.trim(), password: document.getElementById('c-mdp').value
        });
        if (error) { message(esc(msgErreur(error)), 'ko'); return; }
        await chargerProfil(); majEntete(); allerApres();
      });
    });

    document.getElementById('oubli').addEventListener('click', async () => {
      const email = document.getElementById('c-email').value.trim();
      if (!email) { message('Saisissez d\'abord votre email ci-dessus.', 'info'); return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      message(error ? esc(msgErreur(error)) : 'Si un compte existe, un lien de réinitialisation vient d\'être envoyé.', error ? 'ko' : 'ok');
    });

    document.getElementById('form-inscription').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const paysChoisi = document.getElementById('i-pays').value;
      const tel = normTel(document.getElementById('i-tel').value, paysChoisi);
      if (tel.replace(/\D/g, '').length < 11) { message('Numéro WhatsApp incomplet.', 'ko'); return; }
      occupe(ev.target.querySelector('button[type=submit],button:not([type])'), async () => {
        const parrain = parrainValide();
        const meta = { nom_complet: document.getElementById('i-nom').value.trim(), telephone: tel,
                       pays: paysChoisi, region: document.getElementById('i-region').value.trim() };
        if (parrain) { meta.ac = parrain.code; meta.ac_vu_le = new Date(parrain.t).toISOString(); }
        const { data, error } = await sb.auth.signUp({
          email: document.getElementById('i-email').value.trim(),
          password: document.getElementById('i-mdp').value,
          options: {
            data: meta,
            emailRedirectTo: location.origin + location.pathname
          }
        });
        if (error) { message(esc(msgErreur(error)), 'ko'); return; }
        memo.ecrire('ip_parrain', null);
        if (data.session) { await chargerProfil(); majEntete(); toast('Compte créé, bienvenue !'); allerApres(); }
        else message('Compte créé. <b>Ouvrez l\'email que nous venons de vous envoyer</b> pour l\'activer, puis connectez-vous.', 'ok');
      });
    });
  }

  function vueReinitialiser() {
    vue.innerHTML = `<h1>Nouveau mot de passe</h1>
      <form class="carte" id="form-mdp"><label for="n-mdp">Nouveau mot de passe</label>
        <input id="n-mdp" type="password" minlength="6" autocomplete="new-password" required>
        <button class="btn btn-large" style="margin-top:14px">Enregistrer</button></form>`;
    document.getElementById('form-mdp').addEventListener('submit', (ev) => {
      ev.preventDefault();
      occupe(ev.target.querySelector('button'), async () => {
        const { error } = await sb.auth.updateUser({ password: document.getElementById('n-mdp').value });
        if (error) { toast(msgErreur(error), 'ko'); return; }
        toast('Mot de passe modifié'); location.hash = '#/colis';
      });
    });
  }

  // Espace Ambassadeur Commercial (fichier ambassadeur.js)
  const espaceAC = window.IP_AC({
    etat, vue, exigerCompte, chargerProfil, chargerPoints, champsCommande, brancherChamps, lireChamps, telLisible,
    rafraichir: () => router()
  });

  demarrer();
})();
