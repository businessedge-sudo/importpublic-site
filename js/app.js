// Import Public : site public (clients)
(function () {
  const { sb, cfg, fcfa, date, joursRestants, esc, normTel, waLien, ETAPES_CAMPAGNE, ETAPES_DEMANDE, nomPays, optionsPays, listeRegions,
          lib, badge, frise, jauge, msgErreur, toast, compresserImage, urlImageCampagne, occupe } = window.IA;

  const vue = document.getElementById('vue');
  const etat = { session: null, profil: null, groupeur: null, canal: null, recherche: '' };

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  async function demarrer() {
    const { data } = await sb.auth.getSession();
    etat.session = data.session;
    await Promise.all([chargerProfil(), chargerGroupeur()]);
    majEntete();
    brancherRecherche();

    sb.auth.onAuthStateChange(async (evt, session) => {
      etat.session = session;
      if (evt === 'PASSWORD_RECOVERY') { location.hash = '#/reinitialiser'; return; }
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') {
        await chargerProfil();
        majEntete();
      }
    });

    window.addEventListener('hashchange', router);
    router();
  }

  async function chargerProfil() {
    etat.profil = null;
    if (!etat.session) return;
    const { data } = await sb.from('profils').select('*').eq('id', etat.session.user.id).maybeSingle();
    etat.profil = data;
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
    zone.innerHTML = etat.session
      ? `<a class="lien-compte" href="#/compte">${I.utilisateur}<span>${esc((etat.profil && etat.profil.nom_complet || 'Mon compte').split(' ')[0])}</span>${I.chevron}</a>`
      : `<a class="lien-compte" href="#/compte">${I.utilisateur}<span>Se connecter</span></a>`;
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
                     commande: 'colis', colis: 'colis', compte: 'compte', reinitialiser: 'compte' }[morceaux[0] || ''];
    document.querySelectorAll('.nav-bas a, .nav-haut a').forEach((a) => a.classList.toggle('actif', a.dataset.onglet === onglet));
    // Bouton WhatsApp flottant seulement sur l'accueil (ailleurs il masquerait les prix et boutons)
    document.getElementById('wa-flottant').hidden = !(etat.groupeur && etat.groupeur.whatsapp) || (morceaux[0] || '') !== '';
    window.scrollTo(0, 0);

    const routes = {
      '': vueAccueil, campagne: vueCampagne, commande: vueCommande, 'sur-mesure': vueSurMesure,
      demande: vueDemande, colis: vueColis, compte: vueCompte, reinitialiser: vueReinitialiser
    };
    const f = routes[morceaux[0] || ''] || vueAccueil;
    vue.innerHTML = '<div class="chargement">Chargement…</div>';
    Promise.resolve(f(morceaux[1], params)).catch((e) => {
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
          <h1>Vos produits préférés en Chine, <span>livrés à Lomé à petit prix&nbsp;!</span></h1>
          <p class="hero-sous-titre"><b>Profitez des commandes groupées pour acheter malin.</b><br>
            Payez facilement avec T-Money ou Flooz et suivez votre colis.</p>
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

    let dejaCommande = null;
    if (etat.session) {
      const r = await sb.from('commandes').select('id,quantite,statut').eq('campagne_id', id)
        .eq('client_id', etat.session.user.id).neq('statut', 'annulee').maybeSingle();
      dejaCommande = r.data;
    }
    const ouverte = c.statut === 'ouverte' && new Date(c.date_cloture) > new Date();

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
    if (dejaCommande) {
      zone.innerHTML = `<div class="carte"><p><b>Vous avez déjà réservé ${dejaCommande.quantite} unité(s).</b> ${badge(dejaCommande.statut)}</p>
        <a class="btn btn-large" href="#/commande/${dejaCommande.id}">Voir ma commande</a></div>`;
    } else if (!ouverte) {
      zone.innerHTML = `<div class="carte"><div class="alerte alerte-info">Cette campagne n'accepte plus de commandes.</div></div>`;
    } else {
      zone.innerHTML = `<div class="carte">
        <h2>Réserver</h2>
        <label for="qte">Quantité</label>
        <div class="quantite"><button type="button" data-d="-1" aria-label="Moins">−</button>
          <input id="qte" type="number" inputmode="numeric" min="1" value="1"><button type="button" data-d="1" aria-label="Plus">+</button></div>
        <div class="total"><span>Total à payer</span><b id="total">${fcfa(c.prix_unitaire)}</b></div>
        <button class="btn btn-large" id="btn-commander">${etat.session ? 'Réserver et payer' : 'Se connecter pour réserver'}</button>
        <p class="aide" style="margin-top:10px">Si le quota n'est pas atteint à la clôture, vous êtes remboursé.</p>
      </div>`;
      const qte = document.getElementById('qte');
      const majTotal = () => {
        const q = Math.max(1, parseInt(qte.value, 10) || 1);
        document.getElementById('total').textContent = fcfa(q * c.prix_unitaire);
      };
      zone.querySelectorAll('.quantite button').forEach((b) => b.addEventListener('click', () => {
        qte.value = Math.max(1, (parseInt(qte.value, 10) || 1) + Number(b.dataset.d)); majTotal();
      }));
      qte.addEventListener('input', majTotal);
      document.getElementById('btn-commander').addEventListener('click', (ev) => {
        if (!exigerCompte()) return;
        occupe(ev.currentTarget, async () => {
          const q = Math.max(1, parseInt(qte.value, 10) || 1);
          const { data, error } = await sb.from('commandes')
            .insert({ campagne_id: c.id, client_id: etat.session.user.id, quantite: q }).select('id').single();
          if (error) { toast(msgErreur(error), 'ko'); return; }
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
    const [{ data: paiements }, { data: historique }] = await Promise.all([
      sb.from('paiements').select('*').eq('commande_id', id).order('created_at', { ascending: false }),
      sb.from('statuts_expedition').select('statut,created_at').eq('campagne_id', c.id).order('created_at')
    ]);
    const enVerif = (paiements || []).find((p) => p.statut === 'initie');
    const rejete = (paiements || []).find((p) => p.statut === 'echoue');

    let corps = '';
    if (o.statut === 'en_attente_paiement') {
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
    const modifiable = o.statut === 'en_attente_paiement' && !enVerif;
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

    // Colis arrivé à Lomé : le client confirme la réception
    const peutConfirmer = o.statut === 'payee' && ['arrivee', 'terminee'].includes(c.statut);
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
    vue.innerHTML = `
      <a class="retour" href="#/colis">← Mes colis</a>
      <div class="deux-colonnes"><div class="colonne">
      <div class="carte">
        <div style="display:flex;justify-content:space-between;gap:10px"><h1>${esc(c.titre)}</h1>${badge(o.statut)}</div>
        <dl class="cle-valeur">
          <dt>Quantité</dt><dd>${o.quantite}</dd>
          <dt>Montant</dt><dd>${fcfa(o.montant_total)}</dd>
          <dt>Commandé le</dt><dd>${date(o.created_at, true)}</dd>
          <dt>Transport</dt><dd>${esc(lib(c.mode_transport))}</dd>
        </dl>
        <div style="margin-top:12px">${jauge(c.quantite_payee, c.quota)}</div>
      </div>
      ${reception}
      ${corps ? `<div class="carte">${corps}</div>` : ''}
      ${actions}
      ${aide}
      </div><div class="colonne">
      <div class="carte"><h2>Suivi du colis</h2>
        ${suivi ? frise(ETAPES_CAMPAGNE, o.statut === 'livree' ? 'terminee' : c.statut, historique)
          : '<p class="discret">Le suivi démarre dès que votre paiement est validé.</p>'}
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
    const [{ data: historique }, { data: paiements }, photoUrl] = await Promise.all([
      sb.from('historique_demandes').select('statut,created_at').eq('demande_id', id).order('created_at'),
      sb.from('paiements').select('*').eq('demande_id', id).order('created_at', { ascending: false }),
      d.photo_path ? sb.storage.from('demandes').createSignedUrl(d.photo_path, 3600).then((r) => r.data && r.data.signedUrl) : null
    ]);
    const enVerif = (paiements || []).find((p) => p.statut === 'initie');
    const rejete = (paiements || []).find((p) => p.statut === 'echoue');

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
      ${action ? `<div class="carte">${action}</div>` : ''}
      ${gestionDemande}
      <div class="carte"><h2>Suivi</h2>${['refusee', 'annulee'].includes(d.statut) ? '<p class="discret">—</p>' : frise(ETAPES_DEMANDE, d.statut, historique)}</div>
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
      sb.from('commandes').select('id,quantite,montant_total,statut,created_at,campagnes(titre,statut,image_url)')
        .eq('client_id', uid).order('created_at', { ascending: false }),
      sb.from('demandes').select('id,description,statut,montant_devis,created_at').eq('client_id', uid).order('created_at', { ascending: false })
    ]);
    if (co.error) throw co.error;
    if (de.error) throw de.error;

    // Statut le plus parlant pour le client : celui de la campagne une fois payé
    const statutAffiche = (o) => (o.statut === 'payee' ? o.campagnes.statut : o.statut);

    vue.innerHTML = `
      <h1>Mes colis</h1>
      <div class="deux-colonnes egales"><div class="carte"><h2>Commandes groupées</h2>
        ${co.data.length ? co.data.map((o) => `
          <a class="ligne" href="#/commande/${o.id}">
            <div class="vignette" style="background-image:url('${esc(urlImageCampagne(o.campagnes.image_url))}')"></div>
            <div style="flex:1;min-width:0"><div class="ligne-titre">${esc(o.campagnes.titre)}</div>
              <small>${o.quantite} unité(s) · ${fcfa(o.montant_total)}</small></div>
            ${badge(statutAffiche(o))}</a>`).join('')
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
  // Compte : connexion, inscription, profil
  // ------------------------------------------------------------------
  function vueCompte(_, params) {
    const retour = params.get('retour');
    const allerApres = () => { location.hash = '#' + (retour || '/colis'); };

    if (etat.session) {
      const p = etat.profil || {};
      vue.innerHTML = `
        <h1>Mon compte</h1>
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
        <button class="btn btn-second btn-large" id="deconnexion">Se déconnecter</button>`;
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
          await chargerProfil(); majEntete(); toast('Enregistré');
        });
      });
      document.getElementById('p-pays').addEventListener('change', (e) => {
        document.getElementById('p-regions').innerHTML = listeRegions(e.target.value);
      });
      document.getElementById('deconnexion').addEventListener('click', async () => {
        await sb.auth.signOut(); location.hash = '#/';
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

    document.getElementById('i-pays').addEventListener('change', (e) => {
      document.getElementById('i-regions').innerHTML = listeRegions(e.target.value);
      document.getElementById('i-region').value = '';
    });

    document.getElementById('form-connexion').addEventListener('submit', (ev) => {
      ev.preventDefault();
      occupe(ev.target.querySelector('button'), async () => {
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
      occupe(ev.target.querySelector('button'), async () => {
        const { data, error } = await sb.auth.signUp({
          email: document.getElementById('i-email').value.trim(),
          password: document.getElementById('i-mdp').value,
          options: {
            data: { nom_complet: document.getElementById('i-nom').value.trim(), telephone: tel,
                    pays: paysChoisi, region: document.getElementById('i-region').value.trim() },
            emailRedirectTo: location.origin + location.pathname
          }
        });
        if (error) { message(esc(msgErreur(error)), 'ko'); return; }
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

  demarrer();
})();
