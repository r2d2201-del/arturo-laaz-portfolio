import { loadPortfolio, attachYouTubePreviews, renderYouTubeMetrics } from './catalog-view.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await loadPortfolio();

    /* ==========================================
       0. Language Dictionary & Translations (ES / EN)
       ========================================== */
    const TRANSLATIONS = {
        es: {
            nav_cta: "Trabajar Conmigo",
            panel_services_title: "Servicios",
            panel_services_vertical: "Verticales / Reels",
            panel_services_ugc: "UGC & Ads",
            panel_services_motion: "Motion Graphics",
            panel_services_youtube: "YouTube / Horizontales",
            panel_explore_title: "Explorar",
            panel_explore_home: "Inicio",
            panel_explore_philosophy: "Filosofía",
            panel_explore_portfolio: "Portafolio",
            panel_explore_methodology: "Metodología",
            panel_explore_testimonials: "Testimonios",
            panel_contact_title: "Hablemos",
            hero_title: "VÍDEOS QUE <span class=\"highlight\">RETIENEN</span>.<br>ANUNCIOS QUE <span class=\"highlight\">CONVIERTEN</span>.",
            hero_subtitle: "Ayudo a creadores, marcas y agencias a escalar su producción de contenido y maximizar el CTR de sus campañas de publicidad mediante edición de video de alto impacto y retención garantizada.",
            hero_btn_portfolio: "Ver Portafolio <i class=\"fa-solid fa-arrow-down\"></i>",
            hero_btn_quote: "Cotizar Proyecto",
            hero_badge: "Alto Impacto",
            hero_video_title: "Animaciones Explicativas & Motion Graphics",
            hero_video_desc: "Captura la atención en los primeros 3 segundos",
            metric1_title: "Delega lo pesado",
            metric1_label: "y concéntrate en tu negocio",
            metric1_desc: "Escalar tu negocio requiere tiempo, y ocuparte de TODO te lo está impidiendo, ahí entro yo.",
            metric2_title: "Tú lo dices",
            metric2_label: "yo lo hago",
            metric2_desc: "Si tienes un estilo en mente, tu manual de marca o quieres que yo busque un estilo por ti, ahí estaré.",
            metric3_title: "Tu growth partner",
            metric3_label: "tu crecimiento de verdad me importa",
            metric3_desc: "Busco hacer lo posible para que tu contenido sea visto y escuchado, generar más ventas para tu negocio, tú solo dilo.",
            metric4_title: "Sin excusas",
            metric4_label: "entregas que cumplen",
            metric4_desc: "Sé lo importante que es la constancia para los algoritmos. Tus videos listos cuando los necesitas, con la máxima calidad.",
            portfolio_title: "PORTAFOLIO DE TRABAJOS",
            portfolio_tagline: "Una selección de proyectos diseñados para rendir y retener audiencias.",
            filter_all: "Todo",
            filter_vertical: "Verticales / Reels",
            filter_ugc: "UGC & Ads",
            filter_motion: "Motion Graphics",
            filter_youtube: "YouTube / Horizontales",
            load_more_btn: "Ver más trabajos",
            process_title: "MI METODOLOGÍA",
            process_tagline: "Tres etapas sencillas para llevar tus videos al siguiente nivel.",
            step1_title: "Estrategia & Brief",
            step1_desc: "Analizamos el objetivo del video: ¿es retención orgánica o conversión directa de pauta? Definimos el ritmo, ganchos iniciales y entregas el material en bruto mediante una carpeta compartida.",
            step2_title: "Edición Premium",
            step2_desc: "Manos a la obra. Incorporo ganchos de retención visual en los primeros 3 segundos, o en el primer minuto (YOUTUBE) subtítulos animados estilizados, sound design inmersivo, efectos gráficos dinámicos y corrección de color.",
            step3_title: "Revisión & Entrega",
            step3_desc: "Te envío el primer corte para que lo revises y envíes tu feedback,para ajustes rápidos y precisos. Te entrego los archivos finales renderizados en máxima calidad y optimizados para cada red social.",
            testimonials_title: "LO QUE DICEN MIS CLIENTES",
            testimonials_tagline: "Opiniones de creadores y marcas que ya escalaron su contenido.",
            testimonial1_text: "\"La retención de nuestros reels aumentó drásticamente desde que trabajamos con Arturo. Pasamos de tener 15% de usuarios viendo hasta el final a más de un 45%. Su edición es dinámica y entiende perfectamente lo que capta el ojo en móvil.\"",
            testimonial1_role: "Creador de Finanzas & Info-productor",
            testimonial2_text: "\"Nuestros costes por clic (CPC) bajaron a la mitad con los creativos UGC que nos editó Arturo. Su capacidad para colocar subtítulos animados y transiciones rápidas es increíble. Totalmente recomendado si corres anuncios.\"",
            testimonial2_role: "Directora de Ad-Growth en Nova Media",
            testimonial3_text: "\"Trabajar con Arturo es una tranquilidad inmensa. Entrega siempre a tiempo, acepta comentarios constructivos y su criterio de edición de sonido es de nivel cinematográfico. Mi canal de YouTube ha crecido un 30%.\"",
            testimonial3_role: "Youtuber de Tecnología (250K+ subs)",
            contact_title: "¿LISTO PARA ESCALAR TUS VÍDEOS?",
            contact_desc: "Cuéntame sobre tu proyecto y necesidades. Rellena este formulario rápido de calificación y me pondré en contacto contigo en menos de 24 horas para darte una propuesta.",
            contact_email_label: "Envíame un email",
            contact_whatsapp_label: "Hablemos por Whatsapp",
            form_name_label: "Nombre Completo *",
            form_name_placeholder: "Ej. Juan Pérez",
            form_email_label: "Email de Contacto *",
            form_email_placeholder: "Ej. juan@tuempresa.com",
            form_brand_label: "Canal / Marca / Sitio Web",
            form_brand_placeholder: "Ej. youtube.com/c/canal o tumarca.com",
            form_service_label: "¿Qué tipo de servicio necesitas? *",
            form_service_default: "Selecciona una opción",
            form_service_verticals: "Formato Corto Vertical (Reels / TikToks / Shorts)",
            form_service_ugc: "Anuncios de Pauta (UGC / Facebook & Insta Ads)",
            form_service_motion: "Edición con Motion Graphics",
            form_service_youtube: "Videos de YouTube (Largo / Horizontal)",
            form_service_full: "Servicio Completo (Multiplataforma / Híbrido)",
            form_budget_label: "Presupuesto Estimado Mensual *",
            form_budget_default: "Selecciona rango de inversión",
            form_budget_low: "Menos de $1,000 USD",
            form_budget_medium: "$1,000 - $2,500 USD",
            form_budget_high: "Más de $2,500 USD",
            form_message_label: "Detalles del Proyecto / Mensaje *",
            form_message_placeholder: "Cuéntame un poco más sobre el ritmo que buscas, volumen de videos al mes y referencias...",
            form_submit_btn: "Enviar Propuesta & Iniciar",
            footer_copyright: "&copy; 2026 ARTURO. Todos los derechos reservados."
        },
        en: {
            nav_cta: "Work With Me",
            panel_services_title: "Services",
            panel_services_vertical: "Verticals / Reels",
            panel_services_ugc: "UGC & Ads",
            panel_services_motion: "Motion Graphics",
            panel_services_youtube: "YouTube / Horizontal",
            panel_explore_title: "Explore",
            panel_explore_home: "Home",
            panel_explore_philosophy: "Philosophy",
            panel_explore_portfolio: "Portfolio",
            panel_explore_methodology: "Methodology",
            panel_explore_testimonials: "Testimonials",
            panel_contact_title: "Let's Talk",
            hero_title: "VIDEOS THAT <span class=\"highlight\">RETAIN</span>.<br>ADS THAT <span class=\"highlight\">CONVERT</span>.",
            hero_subtitle: "I help creators, brands, and agencies scale their content production and maximize the CTR of their advertising campaigns through high-impact video editing and guaranteed retention.",
            hero_btn_portfolio: "View Portfolio <i class=\"fa-solid fa-arrow-down\"></i>",
            hero_btn_quote: "Get a Quote",
            hero_badge: "High Impact",
            hero_video_title: "Explanatory Animations & Motion Graphics",
            hero_video_desc: "Capture attention in the first 3 seconds",
            metric1_title: "Delegate the heavy lifting",
            metric1_label: "and focus on your business",
            metric1_desc: "Scaling your business takes time, and dealing with EVERYTHING is holding you back—that's where I come in.",
            metric2_title: "You name it",
            metric2_label: "I build it",
            metric2_desc: "If you have a style in mind, your brand guide, or want me to find a style for you, I've got you covered.",
            metric3_title: "Your growth partner",
            metric3_label: "your growth really matters to me",
            metric3_desc: "I strive to make sure your content is seen and heard, generating more sales for your business—just say the word.",
            metric4_title: "No excuses",
            metric4_label: "deliveries that match",
            metric4_desc: "I know how important consistency is for algorithms. Your videos ready when you need them, with the highest quality.",
            portfolio_title: "PORTFOLIO OF WORK",
            portfolio_tagline: "A selection of projects designed to perform and retain audiences.",
            filter_all: "All",
            filter_vertical: "Verticals / Reels",
            filter_ugc: "UGC & Ads",
            filter_motion: "Motion Graphics",
            filter_youtube: "YouTube / Horizontal",
            load_more_btn: "See more work",
            process_title: "MY METHODOLOGY",
            process_tagline: "Three simple steps to take your videos to the next level.",
            step1_title: "Strategy & Brief",
            step1_desc: "We analyze the video's goal: organic retention or direct ad conversion? We define the pacing, initial hooks, and you deliver the raw footage via a shared folder.",
            step2_title: "Premium Editing",
            step2_desc: "Time to work. I incorporate visual retention hooks in the first 3 seconds, or first minute (YouTube), stylized animated captions, immersive sound design, dynamic graphics, and color correction.",
            step3_title: "Review & Delivery",
            step3_desc: "I send you the first cut for review and feedback for quick, precise adjustments. I deliver the final files rendered in maximum quality and optimized for each social network.",
            testimonials_title: "WHAT MY CLIENTS SAY",
            testimonials_tagline: "Reviews from creators and brands who have already scaled their content.",
            testimonial1_text: "\"The retention of our reels increased drastically since working with Arturo. We went from having 15% of users watching until the end to over 45%. His editing is dynamic and he perfectly understands what catches the eye on mobile.\"",
            testimonial1_role: "Finance Creator & Info-producer",
            testimonial2_text: "\"Our cost-per-click (CPC) dropped in half with the UGC creatives Arturo edited for us. His ability to place animated captions and quick transitions is incredible. Highly recommended if you run ads.\"",
            testimonial2_role: "Director of Ad-Growth at Nova Media",
            testimonial3_text: "\"Working with Arturo is an immense peace of mind. He always delivers on time, accepts constructive feedback, and his sound design editing criteria is of cinematic level. My YouTube channel has grown by 30%.\"",
            testimonial3_role: "Tech YouTuber (250K+ subs)",
            contact_title: "READY TO SCALE YOUR VIDEOS?",
            contact_desc: "Tell me about your project and needs. Fill out this quick qualification form and I'll get in touch with you in less than 24 hours to give you a proposal.",
            contact_email_label: "Send me an email",
            contact_whatsapp_label: "Let's chat on Whatsapp",
            form_name_label: "Full Name *",
            form_name_placeholder: "e.g. John Doe",
            form_email_label: "Contact Email *",
            form_email_placeholder: "e.g. john@yourcompany.com",
            form_brand_label: "Channel / Brand / Website",
            form_brand_placeholder: "e.g. youtube.com/c/channel or yourbrand.com",
            form_service_label: "What type of service do you need? *",
            form_service_default: "Select an option",
            form_service_verticals: "Short-Form Vertical (Reels / TikToks / Shorts)",
            form_service_ugc: "Paid Ads (UGC / Facebook & Insta Ads)",
            form_service_motion: "Editing with Motion Graphics",
            form_service_youtube: "YouTube Videos (Long-Form / Horizontal)",
            form_service_full: "Full Service (Multiplatform / Hybrid)",
            form_budget_label: "Estimated Monthly Budget *",
            form_budget_default: "Select investment range",
            form_budget_low: "Less than $1,000 USD",
            form_budget_medium: "$1,000 - $2,500 USD",
            form_budget_high: "More than $2,500 USD",
            form_message_label: "Project Details / Message *",
            form_message_placeholder: "Tell me a bit more about the pacing you're looking for, monthly volume of videos, and references...",
            form_submit_btn: "Submit Proposal & Get Started",
            footer_copyright: "&copy; 2026 ARTURO. All rights reserved."
        }
    };

    const VIDEO_TRANSLATIONS = {
        "Seguro de vida": ["Life Insurance", "Personal Brand"],
        "Video AD": ["Video Ad", "High Retention"],
        "Anuncio para meta": ["Meta Ad", "High CTR"],
        "Anuncio meta ADS": ["Meta Ad", "Best Performance"],
        "Productos o servicios": ["Products or Services", "Business Brand"],
        "Contenido para ADS": ["Content for Ads", "High Performance"],
        "LAMBORGHINI VIDEO EVENT": ["Lamborghini Video Event", "Brand Content"],
        "Short de video largo": ["Long Video Short", "Watch Video"],
        "Short de video long form": ["Long Form Video Short", "Watch Video"],
        "Youtube Short Extract": ["YouTube Short Extract", "Watch Video"],
        "Outdoor Garmin UGC Dacia": ["Outdoor Garmin UGC Dacia", "Watch Video"],
        "Matching your style UGC Allison": ["Matching your style UGC Allison", "High Retention"],
        "Same watch new vibe UGC Corbin": ["Same watch-new vibe UGC Corbin", "High Performance"],
        "Contenido de nicho": ["Niche Content", "Faceless Channel"],
        "Animaciones Explicativas & Motion Graphics": ["Explanatory Animations & Motion Graphics", "Dynamic Visual Design"]
    };

    const HERO_OVERLAY_TRANSLATIONS = {
        "Alto Impacto": "High Impact",
        "Animaciones Explicativas & Motion Graphics": "Explanatory Animations & Motion Graphics",
        "Captura la atención en los primeros 3 segundos": "Capture attention in the first 3 seconds",
        "Formatos UGC & Redes": "UGC & Social Formats"
    };

    /* ==========================================
       1. Floating Pill Header Toggle (Osmo Style)
       ========================================== */
    const menuToggle = document.getElementById('menu-toggle');
    const navbarWrapper = document.getElementById('navbar-wrapper');
    const mainHeader = document.getElementById('main-header');
    const menuTextLabel = document.getElementById('menu-text-label');
    const panelLinks = document.querySelectorAll('.panel-link, .panel-contact-link');

    function toggleMenu() {
        const isOpen = mainHeader.classList.contains('active');
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    function openMenu() {
        navbarWrapper.classList.add('active');
        mainHeader.classList.add('active');
        updateMenuToggleText();
        document.body.style.overflow = 'hidden'; // Lock background scrolling
    }

    function closeMenu() {
        navbarWrapper.classList.remove('active');
        mainHeader.classList.remove('active');
        updateMenuToggleText();
        document.body.style.overflow = ''; // Unlock scrolling
    }

    if (menuToggle) menuToggle.addEventListener('click', toggleMenu);

    // Close menu when clicking links & trigger categories
    panelLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeMenu();
            
            // UX detail: If link has filter data, trigger click on portfolio filter
            const filterLinkValue = link.getAttribute('data-filter-link');
            if (filterLinkValue) {
                const targetFilterBtn = document.querySelector(`.filter-btn[data-filter="${filterLinkValue}"]`);
                if (targetFilterBtn) {
                    // Slight delay to allow smooth scrolling transition first
                    setTimeout(() => {
                        targetFilterBtn.click();
                    }, 400);
                }
            }
        });
    });

    /* ==========================================
       2. Portfolio Category Filtering & Paging (Load More)
       ========================================== */
    const filterButtons = document.querySelectorAll('.filter-btn');
    const portfolioCards = document.querySelectorAll('.portfolio-card');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreContainer = document.querySelector('.portfolio-load-more');
    const portfolioSection = document.getElementById('portfolio');
    
    const ITEMS_LIMIT = 6;
    let isExpanded = false;
    let currentFilter = 'all';

    function updatePortfolio(animate = true) {
        let matchingCount = 0;

        portfolioCards.forEach(card => {
            const category = card.getAttribute('data-category');
            const matchesFilter = (currentFilter === 'all' || category === currentFilter);

            if (matchesFilter) {
                matchingCount++;
                const shouldShow = isExpanded || (matchingCount <= ITEMS_LIMIT);
                
                if (shouldShow) {
                    if (animate) {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95) translateY(10px)';
                        setTimeout(() => {
                            card.style.display = 'flex';
                            card.offsetHeight; // trigger reflow
                            card.style.opacity = '1';
                            card.style.transform = 'scale(1) translateY(0)';
                        }, 200);
                    } else {
                        card.style.display = 'flex';
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1) translateY(0)';
                    }
                } else {
                    if (animate) {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95) translateY(10px)';
                        setTimeout(() => {
                            card.style.display = 'none';
                        }, 200);
                    } else {
                        card.style.display = 'none';
                    }
                }
            } else {
                if (animate) {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95) translateY(10px)';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 200);
                } else {
                    card.style.display = 'none';
                }
            }
        });

        // Show/Hide or update Load More button
        if (matchingCount > ITEMS_LIMIT) {
            if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
            if (loadMoreBtn) {
                if (isExpanded) {
                    loadMoreBtn.classList.add('expanded');
                } else {
                    loadMoreBtn.classList.remove('expanded');
                }
                updateLoadMoreButtonText();
            }
        } else {
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        }
    }

    // Initialize portfolio view on load
    updatePortfolio(false);

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');

            const filterValue = button.getAttribute('data-filter');
            
            // Reset expansion state on category change
            isExpanded = false;
            currentFilter = filterValue;
            
            updatePortfolio(true);
        });
    });

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            
            if (!isExpanded) {
                // Smooth scroll back to top of portfolio when collapsing
                if (portfolioSection) {
                    portfolioSection.scrollIntoView({ behavior: 'smooth' });
                }
                setTimeout(() => {
                    updatePortfolio(true);
                }, 100);
            } else {
                updatePortfolio(true);
            }
        });
    }

    /* ==========================================
       3. Video Autoplay on Card Hover (Previews)
       ========================================== */
    portfolioCards.forEach(card => {
        const video = card.querySelector('.card-video-preview');
        
        if (video && video.tagName === 'VIDEO') {
            // Mouse Enter: Play preview
            card.addEventListener('mouseenter', () => {
                video.currentTime = 0;
                video.play().catch(error => {
                    // Autoplay prevented (standard browser protection)
                    console.log('Video preview playback prevented: ', error);
                });
            });

            // Mouse Leave: Pause and reset preview
            card.addEventListener('mouseleave', () => {
                video.pause();
                video.currentTime = 0;
            });
        }
    });

    /* ==========================================
       4. Video Lightbox Modal (with Aspect Ratio handling)
       ========================================== */
    const videoModal = document.getElementById('video-modal');
    const modalClose = document.getElementById('modal-close');
    const modalBackdrop = videoModal.querySelector('.modal-backdrop');
    const modalVideoPlayer = document.getElementById('modal-video-player');
    const modalYoutubeWrapper = document.getElementById('modal-youtube-wrapper');
    const modalYoutubePlayer = document.getElementById('modal-youtube-player');
    const modalTitle = document.getElementById('modal-title');
    const modalCategory = document.getElementById('modal-category');

    portfolioCards.forEach(card => {
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
        });
        card.addEventListener('click', () => {
            const videoPreview = card.querySelector('.card-video-preview source');
            const youtubeId = card.getAttribute('data-youtube-id');
            const fullVideo = card.getAttribute('data-full-video');
            const category = card.getAttribute('data-category');
            const catText = card.querySelector('.card-category').textContent;
            const titleText = card.querySelector('.card-title').textContent;

            modalTitle.textContent = titleText;
            modalCategory.textContent = catText;

            // Adjust aspect ratio depending on card layout
            if (card.classList.contains('horizontal-ratio')) {
                videoModal.classList.remove('vertical-modal-active');
            } else {
                videoModal.classList.add('vertical-modal-active');
            }

            if (youtubeId) {
                // Play YouTube Video
                if (modalVideoPlayer) {
                    modalVideoPlayer.style.display = 'none';
                    modalVideoPlayer.pause();
                    modalVideoPlayer.src = '';
                }
                if (modalYoutubeWrapper && modalYoutubePlayer) {
                    modalYoutubeWrapper.style.display = 'block';
                    modalYoutubePlayer.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;
                }
            } else {
                // Play HTML5 Video
                if (modalYoutubeWrapper && modalYoutubePlayer) {
                    modalYoutubeWrapper.style.display = 'none';
                    modalYoutubePlayer.src = '';
                }
                if (modalVideoPlayer) {
                    modalVideoPlayer.style.display = 'block';
                    // Use data-full-video if present, otherwise fallback to preview source
                    modalVideoPlayer.src = fullVideo || (videoPreview ? videoPreview.src : '');
                    modalVideoPlayer.load();
                    modalVideoPlayer.play().catch(error => {
                        console.log('Modal video autoplay prevented: ', error);
                    });
                }
            }

            // Open modal
            videoModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    function closeModal() {
        videoModal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Stop HTML5 video
        if (modalVideoPlayer) {
            modalVideoPlayer.pause();
            modalVideoPlayer.src = '';
            modalVideoPlayer.style.display = 'none';
        }
        
        // Stop YouTube video
        if (modalYoutubePlayer) {
            modalYoutubePlayer.src = '';
        }
        if (modalYoutubeWrapper) {
            modalYoutubeWrapper.style.display = 'none';
        }
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    // Escape Key to close modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoModal.classList.contains('active')) {
            closeModal();
        }
    });

    /* ==========================================
       5. Testimonials Slider
       ========================================== */
    const slides = document.querySelectorAll('.testimonial-slide');
    const prevBtn = document.getElementById('slider-prev');
    const nextBtn = document.getElementById('slider-next');
    let currentSlide = 0;
    let autoSlideInterval;

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        
        currentSlide = (index + slides.length) % slides.length;
        slides[currentSlide].classList.add('active');
    }

    function handleNextSlide() {
        showSlide(currentSlide + 1);
        resetAutoSlide();
    }

    function handlePrevSlide() {
        showSlide(currentSlide - 1);
        resetAutoSlide();
    }

    if (nextBtn) nextBtn.addEventListener('click', handleNextSlide);
    if (prevBtn) prevBtn.addEventListener('click', handlePrevSlide);

    // Auto-sliding every 6 seconds
    function startAutoSlide() {
        autoSlideInterval = setInterval(() => {
            showSlide(currentSlide + 1);
        }, 6000);
    }

    function resetAutoSlide() {
        clearInterval(autoSlideInterval);
        startAutoSlide();
    }

    if (slides.length > 0) {
        startAutoSlide();
    }

    /* ==========================================
       6. Funnel Contact Form Qualifying Submission
       ========================================== */
    const qualifyForm = document.getElementById('qualify-form');
    const submitBtn = document.getElementById('submit-btn');
    const formStatus = document.getElementById('form-status');

    if (qualifyForm) {
        qualifyForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Disable button & loading feedback
            submitBtn.disabled = true;
            const currentLang = document.documentElement.lang || 'es';
            const processingText = currentLang === 'en' ? 'Processing Proposal...' : 'Procesando Propuesta...';
            submitBtn.innerHTML = `<span>${processingText}</span> <i class="fa-solid fa-circle-notch fa-spin"></i>`;
            formStatus.className = 'form-status';
            formStatus.textContent = '';

            // Extract form data (for local verification or console logs)
            const formData = {
                name: document.getElementById('form-name').value,
                email: document.getElementById('form-email').value,
                brand: document.getElementById('form-brand').value,
                service: document.getElementById('form-service').value,
                budget: document.getElementById('form-budget').value,
                message: document.getElementById('form-message').value
            };

            console.log('Sending lead to Netlify Forms:', formData);

            // Extract the bot field if present
            const botFieldVal = qualifyForm.querySelector('input[name="bot-field"]') ? qualifyForm.querySelector('input[name="bot-field"]').value : '';

            // Build URL encoded body
            const body = new URLSearchParams();
            body.append("form-name", "qualify-form");
            body.append("bot-field", botFieldVal);
            body.append("name", formData.name);
            body.append("email", formData.email);
            body.append("brand", formData.brand);
            body.append("service", formData.service);
            body.append("budget", formData.budget);
            body.append("message", formData.message);

            // Send payload to Netlify
            fetch("/", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString()
            })
            .then(response => {
                if (response.ok) {
                    // Success State
                    submitBtn.disabled = false;
                    const submitBtnText = currentLang === 'en' ? 'Submit Proposal & Get Started' : 'Enviar Propuesta & Iniciar';
                    submitBtn.innerHTML = `<span data-i18n="form_submit_btn">${submitBtnText}</span> <i class="fa-solid fa-paper-plane"></i>`;
                    
                    formStatus.classList.add('success');
                    
                    let successMessage = '';
                    if (currentLang === 'en') {
                        successMessage = `<i class="fa-solid fa-circle-check"></i> Proposal submitted successfully, ${formData.name}! We will analyze your brand and get back to you within 24 hours.`;
                    } else {
                        successMessage = `<i class="fa-solid fa-circle-check"></i> ¡Propuesta recibida con éxito, ${formData.name}! Analizaremos tu marca y nos comunicaremos en menos de 24 horas.`;
                    }
                    formStatus.innerHTML = successMessage;
                    
                    // Reset form
                    qualifyForm.reset();
                } else {
                    throw new Error("Form submission response not ok");
                }
            })
            .catch(error => {
                console.error('Submission error:', error);
                submitBtn.disabled = false;
                const submitBtnText = currentLang === 'en' ? 'Submit Proposal & Get Started' : 'Enviar Propuesta & Iniciar';
                submitBtn.innerHTML = `<span data-i18n="form_submit_btn">${submitBtnText}</span> <i class="fa-solid fa-paper-plane"></i>`;
                
                formStatus.classList.add('error');
                formStatus.innerHTML = currentLang === 'en' 
                    ? `<i class="fa-solid fa-circle-xmark"></i> Submission failed. Please try again or contact me directly.`
                    : `<i class="fa-solid fa-circle-xmark"></i> Ocurrió un error al enviar. Por favor intenta de nuevo o contáctame directamente.`;
            })
            .finally(() => {
                // Clear status message after 8 seconds
                setTimeout(() => {
                    formStatus.style.opacity = '0';
                    formStatus.style.transition = 'opacity 1s ease';
                    setTimeout(() => {
                        formStatus.textContent = '';
                        formStatus.style.opacity = '1';
                        formStatus.className = 'form-status';
                    }, 1000);
                }, 8000);
            });
        });
    }

    /* ==========================================
       7. Header Scroll Class Toggle
       ========================================== */
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbarWrapper.classList.add('scrolled');
        } else {
            navbarWrapper.classList.remove('scrolled');
        }
    });

    /* ==========================================
       8. Language Logic & Translations
       ========================================== */
    const langOpts = document.querySelectorAll('.lang-opt');

    function initializePortfolioCardData() {
        portfolioCards.forEach(card => {
            const titleEl = card.querySelector('.card-title');
            const metricEl = card.querySelector('.card-metric');
            const categoryEl = card.querySelector('.card-category');

            if (titleEl && !card.hasAttribute('data-original-title')) {
                card.setAttribute('data-original-title', titleEl.textContent.trim());
            }
            if (metricEl && !card.hasAttribute('data-original-metric')) {
                // Get only text content (ignoring the <i> tag child)
                let textContent = '';
                for (let child of metricEl.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        textContent += child.textContent;
                    }
                }
                card.setAttribute('data-original-metric', textContent.trim());
            }
            if (categoryEl && !card.hasAttribute('data-original-category')) {
                card.setAttribute('data-original-category', categoryEl.textContent.trim());
            }
        });
    }

    function setMetricText(target, value) {
        const icon = target.querySelector('i')?.cloneNode(true);
        target.replaceChildren();
        if (icon) target.append(icon);
        target.append(document.createTextNode(' ' + value));
    }

    function translatePortfolioCards(lang) {
        portfolioCards.forEach(card => {
            const titleEl = card.querySelector('.card-title');
            const metricEl = card.querySelector('.card-metric');
            const categoryEl = card.querySelector('.card-category');

            const originalTitle = card.getAttribute('data-original-title');
            const originalMetric = card.getAttribute('data-original-metric');
            const originalCategory = card.getAttribute('data-original-category');

            if (lang === 'en') {
                // Title & Metric translations
                if (VIDEO_TRANSLATIONS[originalTitle]) {
                    const [enTitle, enMetric] = VIDEO_TRANSLATIONS[originalTitle];
                    if (titleEl) titleEl.textContent = enTitle;
                    if (metricEl) {
                        setMetricText(metricEl, enMetric);
                    }
                } else {
                    // Fallback to original
                    if (titleEl) titleEl.textContent = originalTitle;
                    if (metricEl) {
                        setMetricText(metricEl, originalMetric);
                    }
                }

                // Category translations
                if (categoryEl) {
                    if (originalCategory === 'YouTube / Horizontales') {
                        categoryEl.textContent = 'YouTube / Horizontal';
                    } else if (originalCategory === 'Verticales / Reels') {
                        categoryEl.textContent = 'Verticals / Reels';
                    } else {
                        categoryEl.textContent = originalCategory;
                    }
                }
            } else {
                // Restore Spanish originals
                if (titleEl) titleEl.textContent = originalTitle;
                if (metricEl) {
                    setMetricText(metricEl, originalMetric);
                }
                if (categoryEl) categoryEl.textContent = originalCategory;
            }
            if (lang === 'en') {
                if (card.dataset.titleEn && titleEl) titleEl.textContent = card.dataset.titleEn;
                if (card.dataset.metricEn && metricEl) setMetricText(metricEl, card.dataset.metricEn);
                if (card.dataset.categoryEn && categoryEl) categoryEl.textContent = card.dataset.categoryEn;
            }
            card.setAttribute('aria-label', (lang === 'en' ? 'Watch ' : 'Ver ') + (titleEl?.textContent || ''));
        });
    }

    function updateLoadMoreButtonText() {
        if (!loadMoreBtn) return;
        const currentLang = document.documentElement.lang || 'es';
        const span = loadMoreBtn.querySelector('span');
        if (span) {
            if (isExpanded) {
                span.textContent = currentLang === 'en' ? 'See less' : 'Ver menos';
            } else {
                span.textContent = currentLang === 'en' ? 'See more work' : 'Ver más trabajos';
            }
        }
    }

    function updateMenuToggleText() {
        if (!menuTextLabel) return;
        const isOpen = mainHeader.classList.contains('active');
        const currentLang = document.documentElement.lang || 'es';
        if (isOpen) {
            menuTextLabel.textContent = currentLang === 'en' ? 'Close' : 'Cerrar';
        } else {
            menuTextLabel.textContent = currentLang === 'en' ? 'Menu' : 'Menú';
        }
    }

    function translateHeroOverlay(lang) {
        const badgeEl = document.querySelector('.video-overlay-info .badge');
        const titleEl = document.querySelector('.video-overlay-info h3');
        const descEl = document.querySelector('.video-overlay-info p');
        
        if (badgeEl) {
            if (!badgeEl.hasAttribute('data-original-text')) {
                let textContent = '';
                for (let child of badgeEl.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        textContent += child.textContent;
                    }
                }
                badgeEl.setAttribute('data-original-text', textContent.trim());
            }
            const orig = badgeEl.getAttribute('data-original-text');
            const iconHtml = badgeEl.querySelector('i') ? badgeEl.querySelector('i').outerHTML : '';
            if (lang === 'en') {
                const trans = HERO_OVERLAY_TRANSLATIONS[orig] || orig;
                setMetricText(badgeEl, trans);
            } else {
                setMetricText(badgeEl, orig);
            }
        }
        
        if (titleEl) {
            if (!titleEl.hasAttribute('data-original-text')) {
                titleEl.setAttribute('data-original-text', titleEl.textContent.trim());
            }
            const orig = titleEl.getAttribute('data-original-text');
            if (lang === 'en') {
                titleEl.textContent = titleEl.dataset.textEn || HERO_OVERLAY_TRANSLATIONS[orig] || (VIDEO_TRANSLATIONS[orig] ? VIDEO_TRANSLATIONS[orig][0] : orig);
            } else {
                titleEl.textContent = orig;
            }
        }
        
        if (descEl) {
            if (!descEl.hasAttribute('data-original-text')) {
                descEl.setAttribute('data-original-text', descEl.textContent.trim());
            }
            const orig = descEl.getAttribute('data-original-text');
            if (lang === 'en') {
                descEl.textContent = descEl.dataset.textEn || HERO_OVERLAY_TRANSLATIONS[orig] || (VIDEO_TRANSLATIONS[orig] ? VIDEO_TRANSLATIONS[orig][1] : orig);
            } else {
                descEl.textContent = orig;
            }
        }
    }

    function setLanguage(lang) {
        document.documentElement.lang = lang;
        localStorage.setItem('preferredLang', lang);

        // Update selector UI
        langOpts.forEach(opt => {
            if (opt.getAttribute('data-lang') === lang) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });

        // Translate static text elements
        const i18nElements = document.querySelectorAll('[data-i18n]');
        i18nElements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
                element.innerHTML = TRANSLATIONS[lang][key];
            }
        });

        // Translate placeholders
        const i18nPlaceholders = document.querySelectorAll('[data-i18n-placeholder]');
        i18nPlaceholders.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
                element.placeholder = TRANSLATIONS[lang][key];
            }
        });

        // Update toggle text
        updateMenuToggleText();

        document.querySelectorAll('[data-category-es]').forEach(button => {
            button.textContent = lang === 'en' ? button.dataset.categoryEn : button.dataset.categoryEs;
        });
        // Translate portfolio cards
        translatePortfolioCards(lang);
        renderYouTubeMetrics();

        // Translate hero info overlay
        translateHeroOverlay(lang);

        // Translate load more button text
        updateLoadMoreButtonText();
    }

    // Attach click events to language toggles
    langOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            const selectedLang = opt.getAttribute('data-lang');
            setLanguage(selectedLang);
        });
    });

    // Detect browser language and initialize
    const savedLang = localStorage.getItem('preferredLang');
    let defaultLang = 'es';

    if (savedLang === 'es' || savedLang === 'en') {
        defaultLang = savedLang;
    } else {
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang && browserLang.toLowerCase().startsWith('en')) {
            defaultLang = 'en';
        }
    }

    // Run initialization
    initializePortfolioCardData();
    setLanguage(defaultLang);
    attachYouTubePreviews();

});
