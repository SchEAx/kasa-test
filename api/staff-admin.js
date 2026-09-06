import { createClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["admin", "kasa", "satis", "depo", "usta"]);

function usernameSlug(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
}

function normalizedName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

function serviceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireAdmin(req, client) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: { status: 401, message: "Oturum doğrulanamadı." } };

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) {
    return { error: { status: 401, message: "Oturum süresi dolmuş. Tekrar giriş yap." } };
  }

  const { data: caller, error: callerError } = await client
    .from("app_users")
    .select("auth_user_id,name,role,is_active")
    .eq("auth_user_id", authData.user.id)
    .single();
  if (callerError || !caller?.is_active || caller.role !== "admin") {
    return { error: { status: 403, message: "Personel yönetimini yalnızca aktif Admin hesabı kullanabilir." } };
  }
  return { user: authData.user, caller };
}

async function readStaff(client) {
  const { data, error } = await client
    .from("app_users")
    .select("auth_user_id,username,name,role,is_active,last_seen_at,last_login_at,allowed_categories,permissions")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, message: "Method not allowed" });
  }

  const adminClient = serviceClient();
  if (!adminClient) {
    return send(res, 500, { ok: false, message: "Vercel SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik." });
  }

  const authorization = await requireAdmin(req, adminClient);
  if (authorization.error) return send(res, authorization.error.status, { ok: false, message: authorization.error.message });
  if (req.method === "GET") {
    try {
      return send(res, 200, { ok: true, staff: await readStaff(adminClient) });
    } catch (error) {
      return send(res, 500, { ok: false, message: error?.message || "Personeller okunamadı." });
    }
  }

  const createdAuthIds = [];
  try {
    const rawStaff = Array.isArray(req.body?.staff) ? req.body.staff : [];
    if (!rawStaff.length || rawStaff.length > 30) {
      return send(res, 400, { ok: false, message: "Personel listesi boş veya 30 kişi sınırını aşıyor." });
    }

    const staff = rawStaff.map((item) => {
      const name = String(item?.name || "").replace(/\s+/g, " ").trim();
      const role = ALLOWED_ROLES.has(String(item?.role || "")) ? String(item.role) : "kasa";
      const username = usernameSlug(item?.username || name);
      return {
        authUserId: String(item?.authUserId || "").trim() || null,
        username,
        email: `${username}@garage.local`,
        name,
        role,
        password: String(item?.password || "").trim(),
        allowedCategories: Array.isArray(item?.allowedCategories) ? item.allowedCategories.map(String).filter(Boolean) : [],
        permissions: item?.permissions && typeof item.permissions === "object" ? item.permissions : {}
      };
    });

    if (staff.some((item) => !item.name || !item.username)) {
      return send(res, 400, { ok: false, message: "Her personel için geçerli bir ad ve kullanıcı adı gerekli." });
    }
    if (!staff.some((item) => item.role === "admin")) {
      return send(res, 400, { ok: false, message: "Listede en az bir Admin hesabı kalmalı." });
    }
    if (!staff.some((item) => item.authUserId === authorization.user.id)) {
      return send(res, 400, { ok: false, message: "Giriş yaptığın Admin hesabını listeden silemezsin." });
    }

    const duplicate = staff.find((item, index, list) => list.findIndex((other) => other.username === item.username) !== index);
    if (duplicate) return send(res, 400, { ok: false, message: `Aynı kullanıcı adı birden fazla kullanılamaz: ${duplicate.username}` });
    const duplicateName = staff.find((item, index, list) => list.findIndex((other) => normalizedName(other.name) === normalizedName(item.name)) !== index);
    if (duplicateName) return send(res, 400, { ok: false, message: `Aynı personel adı birden fazla kullanılamaz: ${duplicateName.name}` });

    const { data: existingProfiles, error: profileError } = await adminClient
      .from("app_users")
      .select("auth_user_id,username,name,role,is_active,last_seen_at,last_login_at,allowed_categories,permissions");
    if (profileError) throw profileError;

    const { data: authList, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const authByEmail = new Map((authList?.users || []).map((user) => [String(user.email || "").toLowerCase(), user]));
    const authById = new Map((authList?.users || []).map((user) => [String(user.id), user]));
    const profileById = new Map((existingProfiles || []).map((profile) => [String(profile.auth_user_id), profile]));
    const result = [];

    for (const item of staff) {
      let authUserId = item.authUserId;
      const matchingProfile =
        (authUserId ? profileById.get(String(authUserId)) : null) ||
        (existingProfiles || []).find((profile) =>
          String(profile.username || "").toLowerCase() === item.username.toLowerCase() ||
          normalizedName(profile.name) === normalizedName(item.name)
        );
      if (!authUserId) authUserId = matchingProfile?.auth_user_id || authByEmail.get(item.email.toLowerCase())?.id || null;

      // Eski stok sürümlerinden kalmış app_users satırı Auth tarafında yoksa,
      // yeni Auth hesabını oluşturup aynı profil satırını yeni kimliğe bağla.
      let orphanProfileId = null;
      if (authUserId && !authById.has(String(authUserId))) {
        orphanProfileId = matchingProfile?.auth_user_id || authUserId;
        authUserId = authByEmail.get(item.email.toLowerCase())?.id || null;
      }

      if (!authUserId) {
        if (item.password.length < 4) throw new Error(`${item.name} için en az 4 karakterli şifre gir.`);
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email: item.email,
          password: item.password,
          email_confirm: true,
          user_metadata: { name: item.name, username: item.username, role: item.role }
        });
        if (createError) throw new Error(`${item.name} oluşturulamadı: ${createError.message}`);
        authUserId = created.user.id;
        createdAuthIds.push(authUserId);
        authById.set(String(authUserId), created.user);
        authByEmail.set(item.email.toLowerCase(), created.user);
      } else {
        const authChanges = {
          email: item.email,
          user_metadata: { name: item.name, username: item.username, role: item.role }
        };
        if (item.password) {
          if (item.password.length < 4) throw new Error(`${item.name} için şifre en az 4 karakter olmalı.`);
          authChanges.password = item.password;
        }
        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authUserId, authChanges);
        if (updateAuthError) throw new Error(`${item.name} hesabı güncellenemedi: ${updateAuthError.message}`);
      }

      const oldProfile = matchingProfile || profileById.get(String(authUserId));
      const profilePayload = {
        auth_user_id: authUserId,
        username: item.username,
        name: item.name,
        role: item.role,
        allowed_categories: item.allowedCategories,
        permissions: item.permissions,
        is_active: true
      };
      let profileWriteError = null;
      if (orphanProfileId && String(orphanProfileId) !== String(authUserId)) {
        const { error } = await adminClient
          .from("app_users")
          .update(profilePayload)
          .eq("auth_user_id", orphanProfileId);
        profileWriteError = error;
      } else {
        const { error } = await adminClient.from("app_users").upsert(profilePayload, { onConflict: "auth_user_id" });
        profileWriteError = error;
      }
      if (profileWriteError) throw new Error(`${item.name} profili kaydedilemedi: ${profileWriteError.message}`);

      result.push({
        ...profilePayload,
        last_seen_at: oldProfile?.last_seen_at || null,
        last_login_at: oldProfile?.last_login_at || null
      });
    }

    const keptIds = new Set(result.map((item) => String(item.auth_user_id)));
    const removedProfiles = (existingProfiles || []).filter((profile) => profile.is_active !== false && !keptIds.has(String(profile.auth_user_id)));
    for (const profile of removedProfiles) {
      if (String(profile.auth_user_id) === String(authorization.user.id)) continue;
      const { error: deactivateError } = await adminClient
        .from("app_users")
        .update({ is_active: false })
        .eq("auth_user_id", profile.auth_user_id);
      if (deactivateError) throw deactivateError;
    }

    return send(res, 200, { ok: true, staff: result });
  } catch (error) {
    if (createdAuthIds.length) {
      await adminClient.from("app_users").delete().in("auth_user_id", createdAuthIds);
      for (const authUserId of createdAuthIds) await adminClient.auth.admin.deleteUser(authUserId);
    }
    return send(res, 500, { ok: false, message: error?.message || "Personel listesi kaydedilemedi." });
  }
}
