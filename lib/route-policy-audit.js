function paths(value) { return Array.isArray(value) ? value : [value]; }

function auditRouter(mount, router, publicRoutes = []) {
    const allowed = new Set(publicRoutes.map(x => `${x.method.toUpperCase()} ${x.path}`));
    const results = [];
    let inheritedAuth = false;

    for (const layer of router.stack || []) {
        if (!layer.route) {
            if (layer.handle?.qlcdPolicy?.authenticated) inheritedAuth = true;
            continue;
        }
        const routeAuth = inheritedAuth || (layer.route.stack || [])
          .some(x => x.handle?.qlcdPolicy?.authenticated);
        for (const routePath of paths(layer.route.path)) {
            const fullPath = `${mount}${routePath === '/' ? '' : routePath}` || '/';
            for (const method of Object.keys(layer.route.methods || {})) {
                const key = `${method.toUpperCase()} ${fullPath}`;
                results.push({ method: method.toUpperCase(), path: fullPath,
                    protected: routeAuth || allowed.has(key), public: allowed.has(key) });
            }
        }
    }
    return results;
}

function auditRoutePolicies(registry) {
    const routes = registry.flatMap(x => auditRouter(x.mount, x.router, x.publicRoutes));
    return { routes, missing: routes.filter(x => !x.protected),
        protectedCount: routes.filter(x => x.protected && !x.public).length,
        publicCount: routes.filter(x => x.public).length };
}

module.exports = { auditRouter, auditRoutePolicies };
