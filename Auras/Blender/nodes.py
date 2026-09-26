# Petit constructeur de graphes de nodes shader (expressions mathématiques)
import bpy

class G:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.y = 0

    def _node(self, t):
        n = self.nt.nodes.new(t)
        self.y -= 40
        n.location = (0, self.y)
        return n

    def _set(self, sock, v):
        if isinstance(v, (int, float)):
            sock.default_value = v
        else:
            self.nt.links.new(v, sock)

    def m(self, op, a, b=0.0, c=0.0, clamp=False):
        n = self._node('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self._set(n.inputs[0], a)
        self._set(n.inputs[1], b)
        self._set(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b): return self.m('ADD', a, b)
    def sub(self, a, b): return self.m('SUBTRACT', a, b)
    def mul(self, a, b): return self.m('MULTIPLY', a, b)
    def div(self, a, b): return self.m('DIVIDE', a, b)
    def pow(self, a, b): return self.m('POWER', a, b)
    def abs(self, a): return self.m('ABSOLUTE', a)
    def sin(self, a): return self.m('SINE', a)
    def cos(self, a): return self.m('COSINE', a)
    def mx(self, a, b): return self.m('MAXIMUM', a, b)
    def mn(self, a, b): return self.m('MINIMUM', a, b)
    def clamp(self, a): return self.m('ADD', a, 0.0, clamp=True)
    def atan2(self, y, x): return self.m('ARCTAN2', y, x)
    def madd(self, a, b, c): return self.m('MULTIPLY_ADD', a, b, c)

    def smooth(self, e0, e1, x):
        n = self._node('ShaderNodeMapRange')
        n.interpolation_type = 'SMOOTHSTEP'
        n.clamp = True
        self._set(n.inputs['Value'], x)
        self._set(n.inputs['From Min'], e0)
        self._set(n.inputs['From Max'], e1)
        n.inputs['To Min'].default_value = 0.0
        n.inputs['To Max'].default_value = 1.0
        return n.outputs['Result']

    def uv(self):
        tc = self._node('ShaderNodeTexCoord')
        s = self._node('ShaderNodeSeparateXYZ')
        self.nt.links.new(tc.outputs['UV'], s.inputs[0])
        return s.outputs[0], s.outputs[1]

    def attr(self, name):
        n = self._node('ShaderNodeAttribute')
        n.attribute_type = 'OBJECT'
        n.attribute_name = name
        return n.outputs['Fac']

    def vec(self, x, y, z=0.0):
        n = self._node('ShaderNodeCombineXYZ')
        self._set(n.inputs[0], x); self._set(n.inputs[1], y); self._set(n.inputs[2], z)
        return n.outputs[0]

    def noise(self, v, w, scale=2.0, detail=4.0, rough=0.55):
        n = self._node('ShaderNodeTexNoise')
        n.noise_dimensions = '4D'
        self.nt.links.new(v, n.inputs['Vector'])
        self._set(n.inputs['W'], w)
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']

    def output(self, mask):
        """Blanc émissif, alpha = mask (teinté ensuite dans Roblox)."""
        em = self._node('ShaderNodeEmission')
        em.inputs['Color'].default_value = (1, 1, 1, 1)
        em.inputs['Strength'].default_value = 1.0
        tr = self._node('ShaderNodeBsdfTransparent')
        mix = self._node('ShaderNodeMixShader')
        self._set(mix.inputs[0], self.clamp(mask))
        self.nt.links.new(tr.outputs[0], mix.inputs[1])
        self.nt.links.new(em.outputs[0], mix.inputs[2])
        out = self._node('ShaderNodeOutputMaterial')
        self.nt.links.new(mix.outputs[0], out.inputs['Surface'])
