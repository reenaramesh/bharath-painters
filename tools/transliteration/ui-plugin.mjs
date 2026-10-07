// Only source-owned display literals are marked. Data expressions, enum values,
// routes, input values, class names and state payloads remain untouched.
const displayProps = new Set(['title', 'label', 'description', 'eyebrow', 'placeholder', 'helpText', 'hint', 'aria-label', 'aria-description', 'alt', 'loadingLabel', 'emptyLabel']);
const textSetters = /^(setError|setActionError|setNotice|setMessage|setSuccess|setWarning|setLocationError|setSafetyNotice|setConversationsLoadError)$/;
export default function systemCopyPlugin({ types: t }) {
  const normalize = (text) => text.split(/\r?\n/).map((line, index, lines) => {
    let value = line.replace(/\t/g, ' ');
    if (index) value = value.replace(/^ +/, '');
    if (index < lines.length - 1) value = value.replace(/ +$/, '');
    return value;
  }).filter(Boolean).join(' ');
  const displayLiteral = (node) => t.isStringLiteral(node) && /[A-Za-z]/.test(node.value);
  const staticData = (node) => t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)
    || t.isArrayExpression(node) && node.elements.every((item) => item && staticData(item))
    || t.isObjectExpression(node) && node.properties.every((item) => t.isObjectProperty(item) && staticData(item.value));
  const staticProperty = (node, property) => t.isArrayExpression(node) && node.elements.every((item) =>
    t.isObjectExpression(item) && item.properties.some((entry) => t.isObjectProperty(entry) && (entry.key.name || entry.key.value) === property && staticData(entry.value)));
  const safeBinding = (path, node) => {
    const identifier = t.isMemberExpression(node) ? node.object : node;
    if (!t.isIdentifier(identifier)) return false;
    const binding = path.scope.getBinding(identifier.name);
    if (!binding) return false;
    if (binding.path.isVariableDeclarator()) return staticData(binding.path.node.init);
    const fn = binding.path.findParent((parent) => parent.isFunction());
    const call = fn?.parentPath;
    if (!call?.isCallExpression() || !t.isMemberExpression(call.node.callee) || call.node.callee.property.name !== 'map') return false;
    const receiver = call.node.callee.object;
    const data = t.isIdentifier(receiver) ? call.scope.getBinding(receiver.name)?.path.node.init : receiver;
    if (staticData(data)) return true;
    return t.isMemberExpression(node) && staticProperty(data, node.property.name);
  };
  const scriptNode = (node, state, enumValue = false) => {
    state.used = true;
    const attrs = [];
    if (enumValue) attrs.push(t.jsxAttribute(t.jsxIdentifier('enumValue'), t.jsxExpressionContainer(t.booleanLiteral(true))));
    if (t.isTemplateLiteral(node)) {
      attrs.push(t.jsxAttribute(t.jsxIdentifier('parts'), t.jsxExpressionContainer(t.arrayExpression(node.quasis.map((part) => t.stringLiteral(part.value.cooked ?? part.value.raw))))));
      attrs.push(t.jsxAttribute(t.jsxIdentifier('values'), t.jsxExpressionContainer(t.arrayExpression(node.expressions))));
    } else attrs.push(t.jsxAttribute(t.jsxIdentifier('source'), t.jsxExpressionContainer(node)));
    return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('__ScriptText'), attrs, true), null, [], true);
  };
  const attributeCopy = (node, path) => {
    if (displayLiteral(node) || safeBinding(path, node)) return t.objectExpression([t.objectProperty(t.identifier('systemSource'), node)]);
    if (t.isTemplateLiteral(node) && node.quasis.some((part) => /[A-Za-z]/.test(part.value.cooked || ''))) return t.objectExpression([
      t.objectProperty(t.identifier('systemParts'), t.arrayExpression(node.quasis.map((part) => t.stringLiteral(part.value.cooked ?? part.value.raw)))),
      t.objectProperty(t.identifier('systemValues'), t.arrayExpression(node.expressions)),
    ]);
    if (t.isConditionalExpression(node)) {
      const left = attributeCopy(node.consequent, path), right = attributeCopy(node.alternate, path);
      if (left || right) return t.conditionalExpression(node.test, left || node.consequent, right || node.alternate);
    }
    if (t.isLogicalExpression(node)) {
      const right = attributeCopy(node.right, path);
      if (right) return t.logicalExpression(node.operator, node.left, right);
    }
    return null;
  };
  const convert = (node, path, state) => {
    let kind;
    if (t.isIdentifier(node) && /^(error|actionError|notice|success|warning|locationError)$/.test(node.name)) kind = '__ScriptKnownText';
    if (t.isMemberExpression(node) && ['category_name', 'service_category_name', 'profession_label', 'contractor_label', 'employee_singular_label', 'employee_plural_label', 'role'].includes(node.property.name)) kind = '__ScriptStandardText';
    if (t.isMemberExpression(node) && node.property.name === 'name' && t.isIdentifier(node.object) && ['category', 'service', 'unit'].includes(node.object.name)) kind = '__ScriptStandardText';
    if (kind) { state.used = true; return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(kind), [t.jsxAttribute(t.jsxIdentifier('source'), t.jsxExpressionContainer(node))], true), null, [], true); }
    if (t.isMemberExpression(node) && ['status', 'status_display', 'role_display', 'payment_mode', 'payment_mode_display', 'measurement_unit', 'linear_unit_label', 'unit_label', 'surface_type', 'surface_type_display'].includes(node.property.name)) return scriptNode(node, state, true);
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && ['replaceAll', 'toUpperCase', 'toLowerCase'].includes(node.callee.property.name) && safeBinding(path, node.callee.object)) return scriptNode(node, state);
    if (displayLiteral(node) || t.isTemplateLiteral(node) && node.quasis.some((part) => /[A-Za-z]/.test(part.value.cooked || '')) || safeBinding(path, node)) return scriptNode(node, state);
    if (t.isConditionalExpression(node)) return t.conditionalExpression(node.test, convert(node.consequent, path, state), convert(node.alternate, path, state));
    if (t.isLogicalExpression(node)) return t.logicalExpression(node.operator, node.left, convert(node.right, path, state));
    return node;
  };
  return {
    name: 'bharath-system-copy',
    visitor: {
      Program: { enter(_, state) { state.used = false; }, exit(path, state) {
        if (state.used) path.unshiftContainer('body', t.importDeclaration([
          t.importSpecifier(t.identifier('__ScriptText'), t.identifier('ScriptText')),
          t.importSpecifier(t.identifier('__ScriptElement'), t.identifier('ScriptElement')),
          t.importSpecifier(t.identifier('__ScriptKnownText'), t.identifier('ScriptKnownText')),
          t.importSpecifier(t.identifier('__ScriptStandardText'), t.identifier('ScriptStandardText')),
        ], t.stringLiteral('/src/i18n/ScriptText.jsx')));
        if (state.used) path.unshiftContainer('body', t.importDeclaration([
          t.importSpecifier(t.identifier('__systemCopy'), t.identifier('systemCopy')),
          t.importSpecifier(t.identifier('__systemCopyParts'), t.identifier('systemCopyParts')),
          t.importSpecifier(t.identifier('__captureSystemCopy'), t.identifier('captureSystemCopy')),
          t.importSpecifier(t.identifier('__captureSystemCopyParts'), t.identifier('captureSystemCopyParts')),
        ], t.stringLiteral('/src/i18n/systemCopy.js')));
      } },
      JSXText(path, state) {
        const value = normalize(path.node.value);
        if (/[A-Za-z]/.test(value)) path.replaceWith(scriptNode(t.stringLiteral(value), state));
      },
      JSXExpressionContainer(path, state) {
        if (!path.parentPath.isJSXAttribute() && !path.parentPath.isJSXSpreadAttribute()) path.node.expression = convert(path.node.expression, path, state);
      },
      JSXElement: { exit(path, state) {
        const opening = path.node.openingElement;
        if (t.isJSXIdentifier(opening.name) && opening.name.name.startsWith('__Script')) return;
        const fields = [];
        const attrs = [];
        for (const attr of opening.attributes) {
          if (!t.isJSXAttribute(attr) || !displayProps.has(attr.name.name)) { attrs.push(attr); continue; }
          let expression = t.isStringLiteral(attr.value) ? attr.value : t.isJSXExpressionContainer(attr.value) ? attr.value.expression : null;
          const copy = expression && attributeCopy(expression, path);
          if (copy) fields.push(t.objectProperty(t.stringLiteral(attr.name.name), copy));
          else { attrs.push(attr); continue; }
        }
        if (!fields.length) return;
        state.used = true;
        const name = opening.name;
        const element = t.isJSXIdentifier(name) ? /^[a-z]/.test(name.name) ? t.stringLiteral(name.name) : t.identifier(name.name) : t.memberExpression(t.identifier(name.object.name), t.identifier(name.property.name));
        opening.name = t.jsxIdentifier('__ScriptElement');
        if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier('__ScriptElement');
        opening.attributes = [t.jsxAttribute(t.jsxIdentifier('element'), t.jsxExpressionContainer(element)), ...attrs,
          t.jsxAttribute(t.jsxIdentifier('scriptFields'), t.jsxExpressionContainer(t.objectExpression(fields)))];
      } },
      CallExpression(path, state) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee) && textSetters.test(callee.name)) {
          const value = path.node.arguments[0];
          if (displayLiteral(value)) { state.used = true; path.node.arguments[0] = t.callExpression(t.identifier('__captureSystemCopy'), [value]); }
          if (t.isTemplateLiteral(value)) {
            state.used = true;
            path.node.arguments[0] = t.callExpression(t.identifier('__captureSystemCopyParts'), [
              t.arrayExpression(value.quasis.map((part) => t.stringLiteral(part.value.cooked ?? part.value.raw))), t.arrayExpression(value.expressions),
            ]);
          }
        }
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'window' }) && ['confirm', 'alert'].includes(callee.property.name)) {
          const value = path.node.arguments[0];
          if (displayLiteral(value)) { state.used = true; path.node.arguments[0] = t.callExpression(t.identifier('__systemCopy'), [value]); }
          if (t.isTemplateLiteral(value)) {
            state.used = true;
            path.node.arguments[0] = t.callExpression(t.identifier('__systemCopyParts'), [
              t.arrayExpression(value.quasis.map((part) => t.stringLiteral(part.value.cooked ?? part.value.raw))),
              t.arrayExpression(value.expressions),
            ]);
          }
        }
      },
    },
  };
}
